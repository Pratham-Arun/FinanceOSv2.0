"""
Invoice domain schemas — Pydantic v2 request and response models.

Follows the same conventions as schemas/expense.py:
  - Optional fields default to None
  - No business logic in schemas
  - Enums are plain string literals validated by the service layer
"""
from typing import Optional, List
from pydantic import BaseModel, field_validator


# ── Vendor sub-model ──────────────────────────────────────────────────────────

class VendorInfo(BaseModel):
    name: str
    tax_id: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None


# ── Document sub-model ────────────────────────────────────────────────────────

class InvoiceDocument(BaseModel):
    filename: Optional[str] = None
    file_type: Optional[str] = None
    file_path: Optional[str] = None
    file_hash: Optional[str] = None


# ── Create request ────────────────────────────────────────────────────────────

class InvoiceCreateRequest(BaseModel):
    invoice_number: str
    vendor: VendorInfo
    invoice_date: str                       # ISO date string: YYYY-MM-DD
    due_date: Optional[str] = None          # ISO date string: YYYY-MM-DD
    currency: str = "USD"
    subtotal: float
    tax_amount: float = 0.0
    total_amount: float
    description: Optional[str] = None
    document: Optional[InvoiceDocument] = None
    linked_expense_id: Optional[str] = None  # optional link to an expense claim

    @field_validator("subtotal", "tax_amount", "total_amount")
    @classmethod
    def amounts_non_negative(cls, v: float) -> float:
        if v < 0:
            raise ValueError("Amount fields must be non-negative")
        return v


# ── Update request ────────────────────────────────────────────────────────────

class InvoiceUpdateRequest(BaseModel):
    invoice_number: Optional[str] = None
    vendor: Optional[VendorInfo] = None
    invoice_date: Optional[str] = None
    due_date: Optional[str] = None
    currency: Optional[str] = None
    subtotal: Optional[float] = None
    tax_amount: Optional[float] = None
    total_amount: Optional[float] = None
    description: Optional[str] = None
    document: Optional[InvoiceDocument] = None
    linked_expense_id: Optional[str] = None


# ── Action requests ───────────────────────────────────────────────────────────

class InvoiceActionRequest(BaseModel):
    """Used for approve / reject / pay lifecycle endpoints."""
    action: str       # "Approved" | "Rejected" | "Paid"
    comments: str = ""
