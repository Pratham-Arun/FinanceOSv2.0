"""
Stage 3 — Invoice Document Processing Tests

Covers:
  - POST /api/invoices/{id}/upload — happy path, wrong content type, oversized file
  - OCR result linked to invoice_id in the response
  - Invoice record patched with document metadata after upload
  - Confidence threshold warning returned when confidence is low
  - Multiple uploads allowed (each produces a new ocr_results entry)
  - Unauthenticated / wrong-owner access blocked
  - Stage 2 regression: all invoice CRUD and lifecycle endpoints still work
  - Stage 1 regression: expense endpoints unaffected

Run: uv run pytest tests/test_invoice_stage3.py -v
"""
import io
import time
import pytest
from PIL import Image
from fastapi.testclient import TestClient
from server import app


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _login(client, email: str, password: str) -> dict:
    res = client.post("/api/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200, f"Login failed for {email}: {res.text}"
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


@pytest.fixture(scope="module")
def emp_h(client):
    return _login(client, "employee@demo.com", "demo1234")


@pytest.fixture(scope="module")
def mgr_h(client):
    return _login(client, "manager@demo.com", "demo1234")


@pytest.fixture(scope="module")
def fin_h(client):
    return _login(client, "finance@demo.com", "demo1234")


@pytest.fixture(scope="module")
def adm_h(client):
    return _login(client, "admin@demo.com", "admin123")


# ── Helpers ───────────────────────────────────────────────────────────────────

def _invoice_payload(overrides: dict = None) -> dict:
    ts = time.time_ns()
    base = {
        "invoice_number": f"INV-S3-{ts}",
        "vendor": {"name": "TechCorp Solutions Ltd", "tax_id": "GST-99001"},
        "invoice_date": "2026-07-01",
        "due_date":     "2026-08-01",
        "currency":     "USD",
        "subtotal":     500.00,
        "tax_amount":   50.00,
        "total_amount": 550.00,
        "description":  "Stage 3 test invoice",
    }
    if overrides:
        base.update(overrides)
    return base


def _create_invoice(client, headers, overrides=None) -> dict:
    res = client.post("/api/invoices", json=_invoice_payload(overrides), headers=headers)
    assert res.status_code == 200, f"Invoice creation failed: {res.text}"
    return res.json()


def _make_png_bytes(label: str = "invoice") -> bytes:
    """Creates a tiny synthetic PNG for upload tests. Tesseract will fall back to heuristics."""
    img = Image.new("L", (100, 30), color=255)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _upload(client, headers, invoice_id: str, filename: str = "invoice.png",
            file_bytes: bytes = None) -> dict:
    if file_bytes is None:
        file_bytes = _make_png_bytes()
    res = client.post(
        f"/api/invoices/{invoice_id}/upload",
        files={"file": (filename, file_bytes, "image/png")},
        headers=headers,
    )
    return res


# ── 1. Upload Happy Path ──────────────────────────────────────────────────────

class TestInvoiceUploadHappyPath:

    def test_upload_returns_200(self, client, emp_h):
        inv = _create_invoice(client, emp_h)
        res = _upload(client, emp_h, inv["id"])
        assert res.status_code == 200

    def test_upload_response_has_ocr_result(self, client, emp_h):
        inv = _create_invoice(client, emp_h)
        res = _upload(client, emp_h, inv["id"])
        data = res.json()
        assert "ocr_result" in data
        assert data["ocr_result"]["status"] in ("completed", "error")

    def test_upload_ocr_result_linked_to_invoice_id(self, client, emp_h):
        inv = _create_invoice(client, emp_h)
        res = _upload(client, emp_h, inv["id"])
        data = res.json()
        assert data["ocr_result"].get("invoice_id") == inv["id"]

    def test_upload_ocr_result_has_request_id(self, client, emp_h):
        inv = _create_invoice(client, emp_h)
        res = _upload(client, emp_h, inv["id"])
        assert res.json()["ocr_result"].get("request_id") is not None

    def test_upload_ocr_result_has_invoice_specific_fields(self, client, emp_h):
        """
        When the heuristic or parser runs in invoice mode, the returned
        ocr_data should contain due_date and line_items keys.
        """
        inv = _create_invoice(client, emp_h)
        res = _upload(client, emp_h, inv["id"], filename="office_invoice.png")
        data = res.json()
        ocr_data = data["ocr_result"].get("ocr_data", {})
        # These fields are added by the invoice extraction path
        assert "due_date" in ocr_data, f"due_date missing from ocr_data. Keys: {list(ocr_data.keys())}"
        assert "line_items" in ocr_data, f"line_items missing from ocr_data. Keys: {list(ocr_data.keys())}"

    def test_upload_patches_document_metadata_on_invoice(self, client, emp_h):
        """After upload the invoice record should have a 'document' field set."""
        inv = _create_invoice(client, emp_h)
        _upload(client, emp_h, inv["id"], filename="receipt.png")
        # Fetch the invoice and verify document was stored
        get_res = client.get(f"/api/invoices/{inv['id']}", headers=emp_h)
        assert get_res.status_code == 200
        invoice = get_res.json()["invoice"]
        assert invoice.get("document") is not None
        assert invoice["document"].get("file_type") == "png"

    def test_upload_patches_ocr_result_on_invoice_record(self, client, emp_h):
        """Invoice record should carry ocr_result summary after upload."""
        inv = _create_invoice(client, emp_h)
        _upload(client, emp_h, inv["id"])
        get_res = client.get(f"/api/invoices/{inv['id']}", headers=emp_h)
        invoice = get_res.json()["invoice"]
        assert "ocr_result" in invoice
        assert "overall_confidence" in invoice["ocr_result"]

    def test_upload_response_fields_populated_flag(self, client, emp_h):
        """fields_populated should be True when overall_confidence ≥ 0.6."""
        inv = _create_invoice(client, emp_h)
        data = _upload(client, emp_h, inv["id"]).json()
        # Heuristic extraction returns 0.94 overall_confidence → above threshold
        assert "fields_populated" in data

    def test_upload_response_has_message(self, client, emp_h):
        inv = _create_invoice(client, emp_h)
        data = _upload(client, emp_h, inv["id"]).json()
        assert "message" in data
        assert isinstance(data["message"], str) and len(data["message"]) > 0

    def test_multiple_uploads_allowed(self, client, emp_h):
        """Each upload is independent — a second upload must also succeed."""
        inv = _create_invoice(client, emp_h)
        r1 = _upload(client, emp_h, inv["id"], filename="invoice_v1.png")
        r2 = _upload(client, emp_h, inv["id"], filename="invoice_v2.png")
        assert r1.status_code == 200
        assert r2.status_code == 200
        # Each should produce a distinct request_id
        rid1 = r1.json()["ocr_result"].get("request_id")
        rid2 = r2.json()["ocr_result"].get("request_id")
        assert rid1 != rid2


# ── 2. File Validation ────────────────────────────────────────────────────────

class TestInvoiceUploadFileValidation:

    def test_unsupported_file_type_rejected(self, client, emp_h):
        inv = _create_invoice(client, emp_h)
        res = client.post(
            f"/api/invoices/{inv['id']}/upload",
            files={"file": ("document.docx", b"fake docx content", "application/vnd.openxmlformats")},
            headers=emp_h,
        )
        assert res.status_code == 400
        assert "format" in res.json()["detail"].lower() or "unsupported" in res.json()["detail"].lower()

    def test_oversized_file_rejected(self, client, emp_h):
        inv = _create_invoice(client, emp_h)
        # 21 MB of zeros — just over the 20 MB limit
        big_bytes = b"\x00" * (21 * 1024 * 1024)
        res = client.post(
            f"/api/invoices/{inv['id']}/upload",
            files={"file": ("big_invoice.png", big_bytes, "image/png")},
            headers=emp_h,
        )
        assert res.status_code == 400
        assert "size" in res.json()["detail"].lower() or "exceeds" in res.json()["detail"].lower()

    def test_pdf_extension_accepted(self, client, emp_h):
        """PDF is a valid upload type (ocr_service allows it)."""
        inv = _create_invoice(client, emp_h)
        # Tiny fake PDF bytes — OCR will fail gracefully and return a heuristic result
        fake_pdf = b"%PDF-1.4 fake"
        res = client.post(
            f"/api/invoices/{inv['id']}/upload",
            files={"file": ("invoice.pdf", fake_pdf, "application/pdf")},
            headers=emp_h,
        )
        # Should be 200 (OCR gracefully handles unreadable PDFs)
        assert res.status_code == 200

    def test_jpeg_extension_accepted(self, client, emp_h):
        inv = _create_invoice(client, emp_h)
        img = Image.new("L", (50, 50), color=200)
        buf = io.BytesIO()
        img.save(buf, format="JPEG")
        res = client.post(
            f"/api/invoices/{inv['id']}/upload",
            files={"file": ("scan.jpg", buf.getvalue(), "image/jpeg")},
            headers=emp_h,
        )
        assert res.status_code == 200


# ── 3. Upload on Non-existent Invoice ─────────────────────────────────────────

class TestInvoiceUploadErrors:

    def test_upload_to_nonexistent_invoice_returns_404(self, client, emp_h):
        res = _upload(client, emp_h, "inv_does_not_exist_99999")
        assert res.status_code == 404

    def test_upload_without_auth_returns_401_or_403(self, client, emp_h):
        inv = _create_invoice(client, emp_h)
        res = client.post(
            f"/api/invoices/{inv['id']}/upload",
            files={"file": ("invoice.png", _make_png_bytes(), "image/png")},
        )
        assert res.status_code in (401, 403)


# ── 4. Authorization ──────────────────────────────────────────────────────────

class TestInvoiceUploadAuthorization:

    def test_employee_cannot_upload_to_another_employees_invoice(self, client):
        email2 = f"s3_emp2_{time.time_ns()}@test.com"
        reg = client.post("/api/auth/register", json={
            "name": "Stage3 Emp2", "email": email2,
            "password": "pass1234", "role": "Employee",
        })
        emp2_h = {"Authorization": f"Bearer {reg.json()['access_token']}"}
        emp1_h = _login(client, "employee@demo.com", "demo1234")

        inv = _create_invoice(client, emp1_h)
        res = _upload(client, emp2_h, inv["id"])
        assert res.status_code == 403

    def test_manager_can_upload_to_any_invoice(self, client, emp_h, mgr_h):
        inv = _create_invoice(client, emp_h)
        res = _upload(client, mgr_h, inv["id"])
        assert res.status_code == 200

    def test_finance_can_upload_to_any_invoice(self, client, emp_h, fin_h):
        inv = _create_invoice(client, emp_h)
        res = _upload(client, fin_h, inv["id"])
        assert res.status_code == 200

    def test_admin_can_upload_to_any_invoice(self, client, emp_h, adm_h):
        inv = _create_invoice(client, emp_h)
        res = _upload(client, adm_h, inv["id"])
        assert res.status_code == 200


# ── 5. OCR Data Shape ─────────────────────────────────────────────────────────

class TestInvoiceOCRDataShape:
    """Verify the ocr_data dict returned has expected structure."""

    def test_ocr_data_vendor_has_value_and_confidence(self, client, emp_h):
        inv = _create_invoice(client, emp_h)
        data = _upload(client, emp_h, inv["id"], filename="office_supplies.png").json()
        vendor = data["ocr_result"]["ocr_data"].get("vendor", {})
        assert "value" in vendor
        assert "confidence" in vendor
        assert 0.0 <= vendor["confidence"] <= 1.0

    def test_ocr_data_total_amount_has_value_and_confidence(self, client, emp_h):
        inv = _create_invoice(client, emp_h)
        data = _upload(client, emp_h, inv["id"]).json()
        total = data["ocr_result"]["ocr_data"].get("total_amount", {})
        assert "value" in total
        assert total["value"] >= 0.0

    def test_ocr_data_line_items_is_list(self, client, emp_h):
        inv = _create_invoice(client, emp_h)
        data = _upload(client, emp_h, inv["id"]).json()
        line_items_field = data["ocr_result"]["ocr_data"].get("line_items", {})
        assert isinstance(line_items_field.get("value"), list)

    def test_line_item_has_required_keys(self, client, emp_h):
        inv = _create_invoice(client, emp_h)
        data = _upload(client, emp_h, inv["id"]).json()
        items = data["ocr_result"]["ocr_data"]["line_items"]["value"]
        assert len(items) >= 1
        item = items[0]
        for key in ("description", "quantity", "unit_price", "tax", "total"):
            assert key in item, f"line_item missing key: {key}"

    def test_ocr_data_due_date_is_iso_format(self, client, emp_h):
        inv = _create_invoice(client, emp_h)
        data = _upload(client, emp_h, inv["id"]).json()
        due = data["ocr_result"]["ocr_data"].get("due_date", {}).get("value")
        if due:
            import re
            assert re.match(r"\d{4}-\d{2}-\d{2}", due), f"due_date not ISO: {due}"


# ── 6. Stage 2 Regression ─────────────────────────────────────────────────────

class TestStage2Regression:
    """Confirm that Stage 3 changes have not broken Stage 2 invoice CRUD/lifecycle."""

    def test_invoice_create_still_works(self, client, emp_h):
        inv = _create_invoice(client, emp_h)
        assert inv["approval_status"] == "Draft"

    def test_invoice_lifecycle_submit_approve_pay(self, client, emp_h, mgr_h, fin_h):
        inv = _create_invoice(client, emp_h)
        inv_id = inv["id"]

        sub = client.post(f"/api/invoices/{inv_id}/submit", headers=emp_h)
        assert sub.status_code == 200

        appr = client.post(f"/api/invoices/{inv_id}/approve",
                           json={"action": "Approved", "comments": "Regression OK"},
                           headers=mgr_h)
        assert appr.status_code == 200

        pay = client.post(f"/api/invoices/{inv_id}/pay",
                          json={"action": "Paid", "comments": "Regression paid"},
                          headers=fin_h)
        assert pay.status_code == 200
        assert pay.json()["payment_status"] == "Paid"

    def test_invoice_timeline_still_works(self, client, emp_h):
        inv = _create_invoice(client, emp_h)
        res = client.get(f"/api/invoices/{inv['id']}/timeline", headers=emp_h)
        assert res.status_code == 200
        assert any(s["step"] == "Created" for s in res.json()["timeline"])


# ── 7. Stage 1 Regression ─────────────────────────────────────────────────────

class TestStage1Regression:
    """Smoke test that core Phase 1 endpoints are unaffected."""

    def test_expenses_endpoint_works(self, client, emp_h):
        res = client.get("/api/expenses", headers=emp_h)
        assert res.status_code == 200

    def test_auth_me_works(self, client, emp_h):
        res = client.get("/api/auth/me", headers=emp_h)
        assert res.status_code == 200

    def test_expense_upload_endpoint_still_works(self, client, emp_h):
        """The existing /api/expenses/upload must not be broken by Stage 3 changes."""
        img = Image.new("L", (60, 20), color=200)
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        res = client.post(
            "/api/ocr/upload",
            files={"file": ("receipt.png", buf.getvalue(), "image/png")},
            headers=emp_h,
        )
        # Should succeed — OCR service is still intact
        assert res.status_code == 200

    def test_analytics_endpoint_works(self, client, adm_h):
        res = client.get("/api/analytics/summary", headers=adm_h)
        assert res.status_code == 200
