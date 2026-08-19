"""
OCR Results Repository — stores one document per OCR extraction event.
Collection: ocr_results
"""
import datetime
import time
from typing import Optional, List, Dict, Any
from database import mongo, format_doc, format_docs
from repositories.interfaces.base import IOCRResultsRepository


class OCRResultsRepository(IOCRResultsRepository):
    @property
    def col(self):
        return mongo.collection("ocr_results")

    async def store(self, ocr_doc: Dict[str, Any]) -> Dict[str, Any]:
        data = dict(ocr_doc)
        if "id" not in data:
            data["id"] = f"ocr_{time.time_ns()}"
        if "created_at" not in data:
            data["created_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        await self.col.insert_one(data)
        return format_doc(data)

    async def find_by_expense_id(self, expense_id: str) -> Optional[Dict[str, Any]]:
        # Return the most recent OCR result for this expense
        docs = await self.col.find(
            {"expense_id": expense_id}
        ).sort("created_at", -1).to_list(1)
        return format_doc(docs[0]) if docs else None

    async def find_by_request_id(self, request_id: str) -> Optional[Dict[str, Any]]:
        doc = await self.col.find_one({"request_id": request_id})
        return format_doc(doc)

    async def find_all_by_expense(self, expense_id: str) -> List[Dict[str, Any]]:
        docs = await self.col.find(
            {"expense_id": expense_id}
        ).sort("created_at", -1).to_list(None)
        return format_docs(docs)

    async def find_by_invoice_id(self, invoice_id: str) -> Optional[Dict[str, Any]]:
        """Return the most recent OCR result for this invoice."""
        docs = await self.col.find(
            {"invoice_id": invoice_id}
        ).sort("created_at", -1).to_list(1)
        return format_doc(docs[0]) if docs else None

    async def find_all_by_invoice(self, invoice_id: str) -> List[Dict[str, Any]]:
        docs = await self.col.find(
            {"invoice_id": invoice_id}
        ).sort("created_at", -1).to_list(None)
        return format_docs(docs)


ocr_results_repository = OCRResultsRepository()
