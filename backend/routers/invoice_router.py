"""
Invoice Router — thin HTTP layer for the Invoice domain.

Responsibilities: parse HTTP, validate schema, inject auth, call service, return response.
No business logic, no MongoDB access, no authorization rules live here.
"""
from typing import Dict, Any, Optional
from fastapi import APIRouter, Depends, Query, UploadFile, File

from dependencies.auth import get_current_user
from schemas.invoice import InvoiceCreateRequest, InvoiceUpdateRequest, InvoiceActionRequest
from services.invoice_service import invoice_service

router = APIRouter(tags=["Invoices"])


@router.post("/api/invoices")
async def create_invoice(
    req: InvoiceCreateRequest,
    user: Dict[str, Any] = Depends(get_current_user),
):
    return await invoice_service.create_invoice(user, req)


@router.get("/api/invoices")
async def list_invoices(
    page: Optional[int] = Query(None, ge=1),
    limit: Optional[int] = Query(None, ge=1, le=100),
    user: Dict[str, Any] = Depends(get_current_user),
):
    return await invoice_service.list_invoices(user, page=page, limit=limit)


@router.get("/api/invoices/{invoice_id}")
async def get_invoice(
    invoice_id: str,
    user: Dict[str, Any] = Depends(get_current_user),
):
    return await invoice_service.get_invoice(user, invoice_id)


@router.put("/api/invoices/{invoice_id}")
async def update_invoice(
    invoice_id: str,
    req: InvoiceUpdateRequest,
    user: Dict[str, Any] = Depends(get_current_user),
):
    return await invoice_service.update_invoice(user, invoice_id, req)


@router.delete("/api/invoices/{invoice_id}")
async def delete_invoice(
    invoice_id: str,
    user: Dict[str, Any] = Depends(get_current_user),
):
    return await invoice_service.delete_invoice(user, invoice_id)


@router.post("/api/invoices/{invoice_id}/upload")
async def upload_invoice_document(
    invoice_id: str,
    file: UploadFile = File(...),
    user: Dict[str, Any] = Depends(get_current_user),
):
    file_bytes = await file.read()
    return await invoice_service.upload_invoice_document(
        user, invoice_id, file.filename or "upload", file_bytes
    )


@router.post("/api/invoices/{invoice_id}/submit")
async def submit_invoice(
    invoice_id: str,
    user: Dict[str, Any] = Depends(get_current_user),
):
    return await invoice_service.submit_invoice(user, invoice_id)


@router.post("/api/invoices/{invoice_id}/approve")
async def approve_invoice(
    invoice_id: str,
    req: InvoiceActionRequest,
    user: Dict[str, Any] = Depends(get_current_user),
):
    return await invoice_service.approve_invoice(user, invoice_id, req)


@router.post("/api/invoices/{invoice_id}/reject")
async def reject_invoice(
    invoice_id: str,
    req: InvoiceActionRequest,
    user: Dict[str, Any] = Depends(get_current_user),
):
    return await invoice_service.reject_invoice(user, invoice_id, req)


@router.post("/api/invoices/{invoice_id}/pay")
async def pay_invoice(
    invoice_id: str,
    req: InvoiceActionRequest,
    user: Dict[str, Any] = Depends(get_current_user),
):
    return await invoice_service.pay_invoice(user, invoice_id, req)


@router.post("/api/invoices/{invoice_id}/cancel")
async def cancel_invoice(
    invoice_id: str,
    user: Dict[str, Any] = Depends(get_current_user),
):
    return await invoice_service.cancel_invoice(user, invoice_id)


@router.get("/api/invoices/{invoice_id}/timeline")
async def get_invoice_timeline(
    invoice_id: str,
    user: Dict[str, Any] = Depends(get_current_user),
):
    return await invoice_service.get_timeline(user, invoice_id)
