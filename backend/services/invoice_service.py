"""
Invoice Service — business logic for the Invoice domain.

Responsibilities:
  - CRUD with validation
  - Lifecycle / state-machine enforcement
  - Duplicate detection (invoice_number + vendor)
  - Financial consistency check (subtotal + tax ≈ total)
  - Role-based authorization
  - Audit logging on every state change
  - Optional link to an existing expense record

Follows the same conventions as expense_service.py:
  - Service owns all business logic; router is thin
  - Repository interface, never concrete class, is the dependency
  - audit_repository.create() on every significant action
  - notification_repository.create() for stakeholder alerts
  - logger.info / logger.warning for structured observability
"""
import datetime
import time
from typing import Dict, Any, List, Optional

from fastapi import HTTPException

from repositories.invoice_repository import invoice_repository
from repositories.audit_repository import audit_repository
from repositories.notification_repository import notification_repository
from repositories.user_repository import user_repository
from repositories.expense_repository import expense_repository
from utils.logger import logger


# ── Valid status transitions ──────────────────────────────────────────────────
# Maps current_status → set of permitted next statuses.
# Centralised here so the state machine is one source of truth.

_TRANSITIONS: Dict[str, set] = {
    "Draft":           {"Submitted", "Cancelled"},
    "Submitted":       {"Under Review", "Approved", "Rejected", "Cancelled"},
    "Under Review":    {"Approved", "Rejected", "Cancelled"},
    "Approved":        {"Payment Pending", "Paid", "Cancelled"},
    "Payment Pending": {"Paid", "Cancelled"},
    "Paid":            set(),       # terminal
    "Rejected":        set(),       # terminal
    "Cancelled":       set(),       # terminal
}


def _assert_transition(current: str, target: str) -> None:
    allowed = _TRANSITIONS.get(current, set())
    if target not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot transition invoice from '{current}' to '{target}'.",
        )


# ── Authorization helpers ─────────────────────────────────────────────────────

def _can_view(user: Dict[str, Any], invoice: Dict[str, Any]) -> bool:
    role = user["role"]
    if role in ("Admin", "Finance"):
        return True
    if role == "Manager":
        return True                     # managers see all invoices
    # Employee sees only invoices they created
    return invoice.get("created_by") == user["id"]


def _assert_can_view(user: Dict[str, Any], invoice: Dict[str, Any]) -> None:
    if not _can_view(user, invoice):
        raise HTTPException(status_code=403, detail="Not authorised to view this invoice.")


def _assert_can_mutate(user: Dict[str, Any], invoice: Dict[str, Any]) -> None:
    """Employee may only edit their own invoices; Finance/Admin/Manager can edit any."""
    role = user["role"]
    if role in ("Admin", "Finance", "Manager"):
        return
    if invoice.get("created_by") != user["id"]:
        raise HTTPException(status_code=403, detail="Not authorised to modify this invoice.")


def _assert_can_approve(user: Dict[str, Any]) -> None:
    if user["role"] not in ("Admin", "Manager", "Finance"):
        raise HTTPException(status_code=403, detail="Approval requires Manager, Finance, or Admin role.")


def _assert_can_pay(user: Dict[str, Any]) -> None:
    if user["role"] not in ("Admin", "Finance"):
        raise HTTPException(status_code=403, detail="Payment confirmation requires Finance or Admin role.")


# ── Validation helpers ────────────────────────────────────────────────────────

def _validate_financials(subtotal: float, tax: float, total: float) -> None:
    """
    Ensures subtotal + tax ≈ total (within 2-cent rounding tolerance).
    This is always deterministic — never delegated to an LLM.
    """
    expected = round(subtotal + tax, 2)
    if abs(total - expected) > 0.02:
        raise HTTPException(
            status_code=422,
            detail=f"Financial inconsistency: subtotal ({subtotal}) + tax ({tax}) = {expected}, "
                   f"but total_amount is {total}.",
        )


def _validate_dates(invoice_date: Optional[str], due_date: Optional[str]) -> None:
    if not invoice_date:
        return
    try:
        inv_dt = datetime.date.fromisoformat(invoice_date)
    except ValueError:
        raise HTTPException(status_code=422, detail=f"Invalid invoice_date format: '{invoice_date}'.")

    today = datetime.date.today()
    if inv_dt > today:
        raise HTTPException(status_code=422, detail="invoice_date cannot be in the future.")

    window_days = 180
    if (today - inv_dt).days > window_days:
        raise HTTPException(
            status_code=422,
            detail=f"invoice_date is older than the {window_days}-day submission window.",
        )

    if due_date:
        try:
            due_dt = datetime.date.fromisoformat(due_date)
        except ValueError:
            raise HTTPException(status_code=422, detail=f"Invalid due_date format: '{due_date}'.")
        if due_dt < inv_dt:
            raise HTTPException(
                status_code=422,
                detail="due_date cannot be earlier than invoice_date.",
            )


def _validate_total_positive(total: float) -> None:
    if total <= 0:
        raise HTTPException(status_code=422, detail="total_amount must be greater than zero.")


async def _check_duplicate(
    invoice_number: str,
    vendor_name: str,
    exclude_id: Optional[str] = None,
) -> None:
    existing = await invoice_repository.get_by_invoice_number(invoice_number, vendor_name)
    if existing and existing.get("id") != exclude_id:
        raise HTTPException(
            status_code=409,
            detail=f"Duplicate invoice: invoice number '{invoice_number}' from vendor "
                   f"'{vendor_name}' already exists (id={existing['id']}).",
        )


# ── Timeline helper ───────────────────────────────────────────────────────────

def _timeline_entry(actor: str, step: str, details: str = "") -> Dict[str, Any]:
    return {
        "step":      step,
        "actor":     actor,
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "details":   details,
    }


# ── Service ───────────────────────────────────────────────────────────────────

class InvoiceService:

    # ── Create ────────────────────────────────────────────────────────────────

    async def create_invoice(
        self, user: Dict[str, Any], req: Any
    ) -> Dict[str, Any]:
        vendor_name = req.vendor.name

        # Validate
        _validate_total_positive(req.total_amount)
        _validate_financials(req.subtotal, req.tax_amount, req.total_amount)
        _validate_dates(req.invoice_date, req.due_date)
        await _check_duplicate(req.invoice_number, vendor_name)

        # Verify linked expense exists, if provided
        if req.linked_expense_id:
            linked = await expense_repository.find_by_id(req.linked_expense_id)
            if not linked:
                raise HTTPException(
                    status_code=404,
                    detail=f"Linked expense '{req.linked_expense_id}' not found.",
                )

        invoice_id = f"inv_{time.time_ns()}"
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()

        invoice: Dict[str, Any] = {
            "id":               invoice_id,
            "invoice_number":   req.invoice_number,
            "vendor":           req.vendor.model_dump(),
            "invoice_date":     req.invoice_date,
            "due_date":         req.due_date,
            "currency":         req.currency,
            "subtotal":         req.subtotal,
            "tax_amount":       req.tax_amount,
            "total_amount":     req.total_amount,
            "description":      req.description,
            "document":         req.document.model_dump() if req.document else None,
            "linked_expense_id": req.linked_expense_id,
            "payment_status":   "Unpaid",
            "approval_status":  "Draft",
            "created_by":       user["id"],
            "created_by_name":  user["name"],
            "created_at":       now,
            "updated_at":       now,
            "timeline": [
                _timeline_entry(user["name"], "Created", f"Invoice created by {user['name']}"),
            ],
        }

        created = await invoice_repository.create(invoice)
        await audit_repository.create(
            user["id"], "INVOICE_CREATED",
            f"Created invoice {invoice_id} ({req.invoice_number}) for {vendor_name} — {req.currency} {req.total_amount}",
        )
        logger.info("Invoice Created", invoice_id=invoice_id, user_id=user["id"],
                    vendor=vendor_name, total=req.total_amount)
        return created

    # ── List ──────────────────────────────────────────────────────────────────

    async def list_invoices(
        self,
        user: Dict[str, Any],
        page: Optional[int] = None,
        limit: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        role = user["role"]
        if role in ("Admin", "Finance"):
            query: Dict[str, Any] = {}
        elif role == "Manager":
            query = {}      # managers see all invoices
        else:
            query = {"created_by": user["id"]}

        return await invoice_repository.list(query, page=page, limit=limit)

    # ── Get single ────────────────────────────────────────────────────────────

    async def get_invoice(
        self, user: Dict[str, Any], invoice_id: str
    ) -> Dict[str, Any]:
        invoice = await invoice_repository.get_by_id(invoice_id)
        if not invoice:
            raise HTTPException(status_code=404, detail="Invoice not found.")
        _assert_can_view(user, invoice)

        # Optionally attach linked expense summary
        linked_expense = None
        if invoice.get("linked_expense_id"):
            linked_expense = await expense_repository.find_by_id(invoice["linked_expense_id"])

        return {"invoice": invoice, "linked_expense": linked_expense}

    # ── Update ────────────────────────────────────────────────────────────────

    async def update_invoice(
        self, user: Dict[str, Any], invoice_id: str, req: Any
    ) -> Dict[str, Any]:
        invoice = await invoice_repository.get_by_id(invoice_id)
        if not invoice:
            raise HTTPException(status_code=404, detail="Invoice not found.")
        _assert_can_mutate(user, invoice)

        if invoice["approval_status"] not in ("Draft",):
            raise HTTPException(
                status_code=400,
                detail="Only Draft invoices can be edited.",
            )

        updates = req.model_dump(exclude_none=True)

        # Re-validate financials if any amount fields are changing
        subtotal   = updates.get("subtotal",     invoice["subtotal"])
        tax_amount = updates.get("tax_amount",   invoice["tax_amount"])
        total      = updates.get("total_amount", invoice["total_amount"])
        _validate_total_positive(total)
        _validate_financials(subtotal, tax_amount, total)

        invoice_date = updates.get("invoice_date", invoice.get("invoice_date"))
        due_date     = updates.get("due_date",     invoice.get("due_date"))
        _validate_dates(invoice_date, due_date)

        # Re-check duplicate only if invoice_number or vendor changes
        new_inv_num  = updates.get("invoice_number", invoice["invoice_number"])
        new_vnd_name = updates.get("vendor", {}).get("name", invoice["vendor"]["name"]) \
                       if isinstance(updates.get("vendor"), dict) \
                       else (updates["vendor"].name if "vendor" in updates else invoice["vendor"]["name"])
        if new_inv_num != invoice["invoice_number"] or new_vnd_name != invoice["vendor"]["name"]:
            await _check_duplicate(new_inv_num, new_vnd_name, exclude_id=invoice_id)

        # Flatten vendor if it's a Pydantic model
        if "vendor" in updates and hasattr(updates["vendor"], "model_dump"):
            updates["vendor"] = updates["vendor"].model_dump()
        if "document" in updates and hasattr(updates["document"], "model_dump"):
            updates["document"] = updates["document"].model_dump()

        updates["updated_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        await invoice_repository.update(invoice_id, updates)

        await audit_repository.create(
            user["id"], "INVOICE_UPDATED", f"Updated invoice {invoice_id}"
        )
        logger.info("Invoice Updated", invoice_id=invoice_id, user_id=user["id"])
        return {**invoice, **updates}

    # ── Delete ────────────────────────────────────────────────────────────────

    async def delete_invoice(
        self, user: Dict[str, Any], invoice_id: str
    ) -> Dict[str, Any]:
        invoice = await invoice_repository.get_by_id(invoice_id)
        if not invoice:
            raise HTTPException(status_code=404, detail="Invoice not found.")
        _assert_can_mutate(user, invoice)

        if invoice["approval_status"] not in ("Draft", "Rejected", "Cancelled") \
                and user["role"] != "Admin":
            raise HTTPException(
                status_code=400,
                detail="Only Draft, Rejected, or Cancelled invoices can be deleted.",
            )

        await invoice_repository.delete(invoice_id)
        await audit_repository.create(
            user["id"], "INVOICE_DELETED", f"Deleted invoice {invoice_id}"
        )
        logger.info("Invoice Deleted", invoice_id=invoice_id, user_id=user["id"])
        return {"status": "success", "message": f"Invoice {invoice_id} deleted."}

    # ── Submit ────────────────────────────────────────────────────────────────

    async def submit_invoice(
        self, user: Dict[str, Any], invoice_id: str
    ) -> Dict[str, Any]:
        invoice = await invoice_repository.get_by_id(invoice_id)
        if not invoice:
            raise HTTPException(status_code=404, detail="Invoice not found.")
        _assert_can_mutate(user, invoice)
        _assert_transition(invoice["approval_status"], "Submitted")

        now    = datetime.datetime.now(datetime.timezone.utc).isoformat()
        entry  = _timeline_entry(user["name"], "Submitted", f"Submitted by {user['name']}")
        update = {
            "approval_status": "Submitted",
            "updated_at":      now,
            "timeline":        invoice.get("timeline", []) + [entry],
        }
        await invoice_repository.update(invoice_id, update)
        await audit_repository.create(
            user["id"], "INVOICE_SUBMITTED",
            f"Submitted invoice {invoice_id} ({invoice['invoice_number']})"
        )

        # Notify managers/finance that a new invoice is awaiting review
        recipients = await user_repository.find_managers_and_finance()
        for r in recipients:
            if r["role"] in ("Manager", "Finance", "Admin"):
                await notification_repository.create(
                    r["id"],
                    "New Invoice Submitted",
                    f"{user['name']} submitted invoice {invoice['invoice_number']} "
                    f"({invoice['currency']} {invoice['total_amount']}) for review.",
                )

        logger.info("Invoice Submitted", invoice_id=invoice_id, user_id=user["id"])
        return {**invoice, **update}

    # ── Approve ───────────────────────────────────────────────────────────────

    async def approve_invoice(
        self, user: Dict[str, Any], invoice_id: str, req: Any
    ) -> Dict[str, Any]:
        invoice = await invoice_repository.get_by_id(invoice_id)
        if not invoice:
            raise HTTPException(status_code=404, detail="Invoice not found.")
        _assert_can_approve(user)
        _assert_transition(invoice["approval_status"], "Approved")

        now   = datetime.datetime.now(datetime.timezone.utc).isoformat()
        entry = _timeline_entry(
            user["name"], "Approved",
            req.comments or f"Approved by {user['name']}"
        )
        update = {
            "approval_status": "Approved",
            "updated_at":      now,
            "timeline":        invoice.get("timeline", []) + [entry],
        }
        await invoice_repository.update(invoice_id, update)
        await audit_repository.create(
            user["id"], "INVOICE_APPROVED",
            f"{user['name']} approved invoice {invoice_id}"
        )
        await notification_repository.create(
            invoice["created_by"],
            "Invoice Approved",
            f"Your invoice {invoice['invoice_number']} has been approved by {user['name']}.",
        )
        logger.info("Invoice Approved", invoice_id=invoice_id, user_id=user["id"])
        return {**invoice, **update}

    # ── Reject ────────────────────────────────────────────────────────────────

    async def reject_invoice(
        self, user: Dict[str, Any], invoice_id: str, req: Any
    ) -> Dict[str, Any]:
        invoice = await invoice_repository.get_by_id(invoice_id)
        if not invoice:
            raise HTTPException(status_code=404, detail="Invoice not found.")
        _assert_can_approve(user)
        _assert_transition(invoice["approval_status"], "Rejected")

        now   = datetime.datetime.now(datetime.timezone.utc).isoformat()
        entry = _timeline_entry(
            user["name"], "Rejected",
            req.comments or f"Rejected by {user['name']}"
        )
        update = {
            "approval_status": "Rejected",
            "updated_at":      now,
            "timeline":        invoice.get("timeline", []) + [entry],
        }
        await invoice_repository.update(invoice_id, update)
        await audit_repository.create(
            user["id"], "INVOICE_REJECTED",
            f"{user['name']} rejected invoice {invoice_id}: {req.comments}"
        )
        await notification_repository.create(
            invoice["created_by"],
            "Invoice Rejected",
            f"Your invoice {invoice['invoice_number']} was rejected by {user['name']}: {req.comments}",
        )
        logger.info("Invoice Rejected", invoice_id=invoice_id, user_id=user["id"])
        return {**invoice, **update}

    # ── Pay ───────────────────────────────────────────────────────────────────

    async def pay_invoice(
        self, user: Dict[str, Any], invoice_id: str, req: Any
    ) -> Dict[str, Any]:
        invoice = await invoice_repository.get_by_id(invoice_id)
        if not invoice:
            raise HTTPException(status_code=404, detail="Invoice not found.")
        _assert_can_pay(user)
        _assert_transition(invoice["approval_status"], "Paid")

        payment_ref = f"TXN-INV-{int(time.time())}"
        now   = datetime.datetime.now(datetime.timezone.utc).isoformat()
        entry = _timeline_entry(
            user["name"], "Paid",
            f"Payment confirmed by {user['name']}. Ref: {payment_ref}"
        )
        update = {
            "approval_status":  "Paid",
            "payment_status":   "Paid",
            "payment_reference": payment_ref,
            "updated_at":       now,
            "timeline":         invoice.get("timeline", []) + [entry],
        }
        await invoice_repository.update(invoice_id, update)
        await audit_repository.create(
            user["id"], "INVOICE_PAID",
            f"Invoice {invoice_id} marked paid. Ref: {payment_ref}"
        )
        await notification_repository.create(
            invoice["created_by"],
            "Invoice Payment Confirmed",
            f"Payment reference {payment_ref} issued for invoice {invoice['invoice_number']}.",
        )
        logger.info("Invoice Paid", invoice_id=invoice_id, payment_ref=payment_ref, user_id=user["id"])
        return {**invoice, **update}

    # ── Cancel ────────────────────────────────────────────────────────────────

    async def cancel_invoice(
        self, user: Dict[str, Any], invoice_id: str
    ) -> Dict[str, Any]:
        invoice = await invoice_repository.get_by_id(invoice_id)
        if not invoice:
            raise HTTPException(status_code=404, detail="Invoice not found.")
        _assert_can_mutate(user, invoice)
        _assert_transition(invoice["approval_status"], "Cancelled")

        now   = datetime.datetime.now(datetime.timezone.utc).isoformat()
        entry = _timeline_entry(user["name"], "Cancelled", f"Cancelled by {user['name']}")
        update = {
            "approval_status": "Cancelled",
            "updated_at":      now,
            "timeline":        invoice.get("timeline", []) + [entry],
        }
        await invoice_repository.update(invoice_id, update)
        await audit_repository.create(
            user["id"], "INVOICE_CANCELLED", f"Cancelled invoice {invoice_id}"
        )
        logger.info("Invoice Cancelled", invoice_id=invoice_id, user_id=user["id"])
        return {**invoice, **update}

    # ── Upload Document ───────────────────────────────────────────────────────

    async def upload_invoice_document(
        self, user: Dict[str, Any], invoice_id: str,
        filename: str, file_bytes: bytes,
    ) -> Dict[str, Any]:
        """
        Upload and OCR-process a document attached to an existing invoice.

        Pipeline:
          1. Fetch + authorise invoice
          2. Validate file via ocr_service
          3. Run ocr_service.process_receipt with doc_type="invoice"
          4. Patch the invoice record with the extracted document fields
          5. Audit log + return structured result

        The OCR result is stored in ``ocr_results`` linked to ``invoice_id``.
        Existing invoice data is NOT overwritten if extraction confidence is
        below 0.6 — a human should review low-confidence extractions.
        """
        from services.ocr_service import ocr_service

        invoice = await invoice_repository.get_by_id(invoice_id)
        if not invoice:
            raise HTTPException(status_code=404, detail="Invoice not found.")
        _assert_can_mutate(user, invoice)

        # Validate file type / size
        valid, msg = ocr_service.validate_file(filename, len(file_bytes))
        if not valid:
            raise HTTPException(status_code=400, detail=msg)

        # Run the full OCR pipeline with invoice-specific field extraction
        ocr_result = await ocr_service.process_receipt(
            file_bytes=file_bytes,
            filename=filename,
            expense_id=invoice.get("linked_expense_id"),
            user_id=user["id"],
            invoice_id=invoice_id,
            doc_type="invoice",
        )

        # ── Patch the invoice record with extracted fields ────────────────────
        ocr_data = ocr_result.get("ocr_data", {})
        overall_conf = ocr_result.get("overall_confidence", 0.0)

        def _field_val(field: str, default=None):
            f = ocr_data.get(field, {})
            return f.get("value", default) if isinstance(f, dict) else default

        def _field_conf(field: str, default=0.0) -> float:
            f = ocr_data.get(field, {})
            return float(f.get("confidence", default)) if isinstance(f, dict) else default

        # Build the document meta for the invoice record
        document_meta = {
            "filename":    filename,
            "file_type":   filename.rsplit(".", 1)[-1].lower(),
            "file_path":   ocr_result.get("receipt_url", ""),
        }

        # Fields to patch — only apply if confidence is good enough
        patch: Dict[str, Any] = {
            "document": document_meta,
            "ocr_result": {
                "request_id":        ocr_result.get("request_id"),
                "provider":          ocr_result.get("ocr_provider"),
                "overall_confidence": overall_conf,
                "extracted_fields":  ocr_data,
                "processed_at":      datetime.datetime.now(datetime.timezone.utc).isoformat(),
            },
            "updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        }

        CONFIDENCE_THRESHOLD = 0.6

        # Auto-populate invoice fields from OCR when confidence is sufficient
        # and the field hasn't already been manually set (non-null).
        if overall_conf >= CONFIDENCE_THRESHOLD:
            extracted_vendor = _field_val("vendor")
            if extracted_vendor and not invoice.get("vendor", {}).get("name"):
                patch["vendor"] = {
                    **(invoice.get("vendor") or {}),
                    "name":   extracted_vendor,
                    "tax_id": _field_val("vendor_tax_id"),
                }

            extracted_inv_num = _field_val("invoice_number")
            if extracted_inv_num and not invoice.get("invoice_number"):
                patch["invoice_number"] = extracted_inv_num

            extracted_date = _field_val("transaction_date")
            if extracted_date and not invoice.get("invoice_date"):
                patch["invoice_date"] = extracted_date

            extracted_due = _field_val("due_date")
            if extracted_due and not invoice.get("due_date"):
                patch["due_date"] = extracted_due

            extracted_total = _field_val("total_amount")
            if extracted_total and _field_conf("total_amount") >= CONFIDENCE_THRESHOLD:
                if not invoice.get("total_amount"):
                    patch["total_amount"] = float(extracted_total)

            extracted_subtotal = _field_val("subtotal")
            if extracted_subtotal and _field_conf("subtotal") >= CONFIDENCE_THRESHOLD:
                if not invoice.get("subtotal"):
                    patch["subtotal"] = float(extracted_subtotal)

            extracted_tax = _field_val("tax_amount")
            if extracted_tax is not None and _field_conf("tax_amount") >= CONFIDENCE_THRESHOLD:
                if not invoice.get("tax_amount"):
                    patch["tax_amount"] = float(extracted_tax)

            extracted_line_items = _field_val("line_items")
            if extracted_line_items and not invoice.get("line_items"):
                patch["line_items"] = extracted_line_items

        patch["ocr_confidence"] = overall_conf
        await invoice_repository.update(invoice_id, patch)

        await audit_repository.create(
            user["id"], "INVOICE_DOCUMENT_UPLOADED",
            f"Document '{filename}' uploaded and OCR-processed for invoice {invoice_id}. "
            f"Confidence: {overall_conf:.2f}. Fields auto-populated: {overall_conf >= CONFIDENCE_THRESHOLD}",
        )
        logger.info(
            "Invoice Document Processed",
            invoice_id=invoice_id,
            filename=filename,
            overall_confidence=overall_conf,
            request_id=ocr_result.get("request_id"),
            user_id=user["id"],
        )

        return {
            "status":            "success",
            "invoice_id":        invoice_id,
            "ocr_result":        ocr_result,
            "fields_populated":  overall_conf >= CONFIDENCE_THRESHOLD,
            "confidence_warning": overall_conf < CONFIDENCE_THRESHOLD,
            "message": (
                "Document processed. Extracted fields auto-populated on the invoice."
                if overall_conf >= CONFIDENCE_THRESHOLD
                else f"Document processed, but confidence ({overall_conf:.2f}) is below threshold. "
                     "Please review and update the invoice fields manually."
            ),
        }

    # ── Timeline ──────────────────────────────────────────────────────────────

    async def get_timeline(
        self, user: Dict[str, Any], invoice_id: str
    ) -> Dict[str, Any]:
        invoice = await invoice_repository.get_by_id(invoice_id)
        if not invoice:
            raise HTTPException(status_code=404, detail="Invoice not found.")
        _assert_can_view(user, invoice)
        return {
            "invoice_id": invoice_id,
            "timeline":   invoice.get("timeline", []),
        }


invoice_service = InvoiceService()
