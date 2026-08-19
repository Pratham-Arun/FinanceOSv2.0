"""
Invoice Repository — MongoDB implementation of IInvoiceRepository.

Follows the same conventions as expense_repository.py:
  - Property accessor for the collection (lazy, never cached at import time)
  - All queries use the string `id` field, not `_id`
  - format_doc / format_docs applied on all returns
  - No business logic
"""
from typing import Optional, List, Dict, Any
from database import mongo, format_doc, format_docs
from repositories.interfaces.base import IInvoiceRepository


class InvoiceRepository(IInvoiceRepository):

    @property
    def col(self):
        return mongo.collection("invoices")

    async def create(self, invoice_data: Dict[str, Any]) -> Dict[str, Any]:
        data = dict(invoice_data)
        await self.col.insert_one(data)
        return format_doc(data)

    async def get_by_id(self, invoice_id: str) -> Optional[Dict[str, Any]]:
        doc = await self.col.find_one({"id": invoice_id})
        return format_doc(doc)

    async def get_by_invoice_number(
        self, invoice_number: str, vendor_name: str
    ) -> Optional[Dict[str, Any]]:
        """Duplicate detection: match on invoice_number + vendor name (case-insensitive)."""
        doc = await self.col.find_one({
            "invoice_number": {"$regex": f"^{invoice_number}$", "$options": "i"},
            "vendor.name":    {"$regex": f"^{vendor_name}$",    "$options": "i"},
        })
        return format_doc(doc)

    async def list(
        self,
        query: Dict[str, Any],
        page: Optional[int] = None,
        limit: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        cursor = self.col.find(query).sort("created_at", -1)
        if page and limit and page > 0 and limit > 0:
            cursor = cursor.skip((page - 1) * limit).limit(limit)
        docs = await cursor.to_list(None)
        return format_docs(docs)

    async def update(self, invoice_id: str, update_fields: Dict[str, Any]) -> None:
        await self.col.update_one({"id": invoice_id}, {"$set": update_fields})

    async def delete(self, invoice_id: str) -> None:
        await self.col.delete_one({"id": invoice_id})


invoice_repository: IInvoiceRepository = InvoiceRepository()
