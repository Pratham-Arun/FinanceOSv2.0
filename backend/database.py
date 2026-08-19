"""MongoDB connection, indexing, and document formatting helpers for the Finance backend."""

import os
from typing import Dict, Any, List, Optional
from fastapi import HTTPException
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from dotenv import load_dotenv
from utils.logger import logger

load_dotenv()


class Mongo:
    client: AsyncIOMotorClient | None = None
    db: AsyncIOMotorDatabase | None = None

    async def connect(self) -> None:
        uri = os.getenv("MONGO_URI")
        if not uri:
            logger.error("MONGO_URI environment variable is missing")
            raise RuntimeError("MONGO_URI must be configured before starting the backend")
        
        logger.info("Connecting to MongoDB...")
        self.client = AsyncIOMotorClient(uri, serverSelectionTimeoutMS=5000)
        await self.client.admin.command("ping")
        
        database_name = os.getenv("MONGO_DB_NAME", "expense_reimbursement")
        self.db = self.client[database_name]
        logger.info(f"Connected to MongoDB database: '{database_name}'")

        # 1. MongoDB Indexes
        await self.db.users.create_index("email", unique=True)
        await self.db.expenses.create_index([("employee_id", 1), ("status", 1)])
        await self.db.expenses.create_index([("created_at", -1)])
        await self.db.notifications.create_index([("user_id", 1), ("read", 1)])
        await self.db.notifications.create_index([("user_id", 1), ("created_at", -1)])
        await self.db.approvals.create_index([("expense_id", 1)])
        await self.db.audit_logs.create_index([("timestamp", -1)])
        # Phase 2 collections
        await self.db.ocr_results.create_index([("expense_id", 1)])
        await self.db.ocr_results.create_index([("created_at", -1)])
        await self.db.ocr_results.create_index([("request_id", 1)])
        await self.db.ocr_results.create_index([("invoice_id", 1)])
        await self.db.ai_configuration.create_index([("id", 1)], unique=True)
        # Invoice domain (Stage 2)
        await self.db.invoices.create_index([("created_by", 1), ("approval_status", 1)])
        await self.db.invoices.create_index([("created_at", -1)])
        await self.db.invoices.create_index([("invoice_number", 1), ("vendor.name", 1)])
        logger.info("MongoDB indexes verified successfully.")

    async def disconnect(self) -> None:
        if self.client:
            self.client.close()
            logger.info("Disconnected from MongoDB.")
        self.client = None
        self.db = None

    def collection(self, name: str):
        if self.db is None:
            logger.error("Attempted to access collection before DB connection was established")
            raise HTTPException(503, "Database connection is unavailable")
        return self.db[name]


mongo = Mongo()


def format_doc(doc: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Safely converts MongoDB _id to string 'id' without modifying raw ObjectId state."""
    if doc is None:
        return None
    res = dict(doc)
    if "_id" in res:
        raw_id = res.pop("_id")
        if "id" not in res or not res["id"]:
            res["id"] = str(raw_id)
    return res


def format_docs(docs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Applies format_doc to a list of MongoDB documents."""
    return [format_doc(d) for d in docs if d is not None]
