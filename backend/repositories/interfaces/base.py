from abc import ABC, abstractmethod
from typing import Optional, List, Dict, Any

class IUserRepository(ABC):
    @abstractmethod
    async def count(self) -> int:
        pass

    @abstractmethod
    async def insert_many(self, users: List[Dict[str, Any]]) -> None:
        pass

    @abstractmethod
    async def find_by_email(self, email: str) -> Optional[Dict[str, Any]]:
        pass

    @abstractmethod
    async def find_by_id(self, user_id: str) -> Optional[Dict[str, Any]]:
        pass

    @abstractmethod
    async def find_managers_and_finance(self) -> List[Dict[str, Any]]:
        pass

    @abstractmethod
    async def find_direct_reports(self, manager_id: str) -> List[Dict[str, Any]]:
        pass

    @abstractmethod
    async def create_user(self, user_data: Dict[str, Any]) -> Dict[str, Any]:
        pass


class IExpenseRepository(ABC):
    @abstractmethod
    async def create(self, expense_data: Dict[str, Any], session=None) -> Dict[str, Any]:
        pass

    @abstractmethod
    async def find_by_id(self, expense_id: str) -> Optional[Dict[str, Any]]:
        pass

    @abstractmethod
    async def find_expenses(
        self,
        query: Dict[str, Any],
        page: Optional[int] = None,
        limit: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        pass

    @abstractmethod
    async def update_expense(self, expense_id: str, update_fields: Dict[str, Any], session=None) -> None:
        pass

    @abstractmethod
    async def delete_expense(self, expense_id: str, session=None) -> None:
        pass

    @abstractmethod
    async def find_duplicate(self, employee_id: str, amount: float, expense_date: str) -> Optional[Dict[str, Any]]:
        pass

    @abstractmethod
    async def find_all_by_employee(self, employee_id: str) -> List[Dict[str, Any]]:
        pass

    @abstractmethod
    async def find_all(self) -> List[Dict[str, Any]]:
        pass

    @abstractmethod
    async def aggregate(self, pipeline: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        pass


class IPolicyRepository(ABC):
    @abstractmethod
    async def count(self) -> int:
        pass

    @abstractmethod
    async def insert_many(self, policies: List[Dict[str, Any]]) -> None:
        pass

    @abstractmethod
    async def find_by_category(self, category: str) -> Optional[Dict[str, Any]]:
        pass

    @abstractmethod
    async def find_all(self) -> List[Dict[str, Any]]:
        pass

    @abstractmethod
    async def upsert_policy(self, category: str, max_limit: float, receipt_required: bool, duplicate_window_days: int) -> Dict[str, Any]:
        pass

    @abstractmethod
    async def get_version_history(self) -> List[Dict[str, Any]]:
        pass


class IApprovalRepository(ABC):
    @abstractmethod
    async def create(self, approval_data: Dict[str, Any], session=None) -> Dict[str, Any]:
        pass

    @abstractmethod
    async def find_by_expense_id(self, expense_id: str) -> List[Dict[str, Any]]:
        pass


class INotificationRepository(ABC):
    @abstractmethod
    async def create(self, user_id: str, title: str, message: str, session=None) -> Dict[str, Any]:
        pass

    @abstractmethod
    async def find_by_user_id(self, user_id: str) -> List[Dict[str, Any]]:
        pass

    @abstractmethod
    async def mark_read_by_user_id(self, user_id: str, session=None) -> None:
        pass


class IAuditRepository(ABC):
    @abstractmethod
    async def create(self, user_id: str, action: str, details: str, session=None) -> Dict[str, Any]:
        pass

    @abstractmethod
    async def get_recent_logs(self, limit: int = 20) -> List[Dict[str, Any]]:
        pass


class IAILogsRepository(ABC):
    @abstractmethod
    async def log_event(
        self,
        expense_id: Optional[str],
        user_id: str,
        event_type: str,
        ocr_data: Optional[Dict[str, Any]] = None,
        rule_output: Optional[Dict[str, Any]] = None,
        ai_recommendation: Optional[Dict[str, Any]] = None,
        user_decision: Optional[str] = None,
        manager_override: Optional[Dict[str, Any]] = None,
        finance_override: Optional[Dict[str, Any]] = None,
        details: Optional[str] = None,
        prompt: Optional[str] = None,
        retrieved_context: Optional[List[str]] = None,
        llm_response_raw: Optional[str] = None,
        latency_ms: Optional[float] = None,
        token_usage: Optional[int] = None,
        estimated_cost_usd: Optional[float] = None,
        error: Optional[str] = None
    ) -> Dict[str, Any]:
        pass

    @abstractmethod
    async def get_logs(self, limit: int = 50, event_type: Optional[str] = None) -> List[Dict[str, Any]]:
        pass

    @abstractmethod
    async def get_logs_by_expense(self, expense_id: str) -> List[Dict[str, Any]]:
        pass

    @abstractmethod
    async def get_logs_by_request_id(self, request_id: str) -> List[Dict[str, Any]]:
        pass


class IKnowledgeRepository(ABC):
    @abstractmethod
    async def count(self) -> int:
        pass

    @abstractmethod
    async def insert_doc(self, doc_data: Dict[str, Any]) -> Dict[str, Any]:
        pass

    @abstractmethod
    async def find_all(self) -> List[Dict[str, Any]]:
        pass

    @abstractmethod
    async def search_by_text(self, query: str, limit: int = 5) -> List[Dict[str, Any]]:
        pass

    @abstractmethod
    async def delete_by_id(self, doc_id: str) -> bool:
        pass


class IOCRResultsRepository(ABC):
    """Interface for the ocr_results collection."""

    @abstractmethod
    async def store(self, ocr_doc: Dict[str, Any]) -> Dict[str, Any]:
        pass

    @abstractmethod
    async def find_by_expense_id(self, expense_id: str) -> Optional[Dict[str, Any]]:
        pass

    @abstractmethod
    async def find_by_request_id(self, request_id: str) -> Optional[Dict[str, Any]]:
        pass

    @abstractmethod
    async def find_all_by_expense(self, expense_id: str) -> List[Dict[str, Any]]:
        pass

    @abstractmethod
    async def find_by_invoice_id(self, invoice_id: str) -> Optional[Dict[str, Any]]:
        pass

    @abstractmethod
    async def find_all_by_invoice(self, invoice_id: str) -> List[Dict[str, Any]]:
        pass


class IAIConfigRepository(ABC):
    """Interface for the ai_configuration singleton collection."""

    @abstractmethod
    async def get_config(self) -> Dict[str, Any]:
        pass

    @abstractmethod
    async def upsert(self, updates: Dict[str, Any], updated_by: str) -> Dict[str, Any]:
        pass


class IInvoiceRepository(ABC):
    """Interface for the invoices collection."""

    @abstractmethod
    async def create(self, invoice_data: Dict[str, Any]) -> Dict[str, Any]:
        pass

    @abstractmethod
    async def get_by_id(self, invoice_id: str) -> Optional[Dict[str, Any]]:
        pass

    @abstractmethod
    async def get_by_invoice_number(self, invoice_number: str, vendor_name: str) -> Optional[Dict[str, Any]]:
        pass

    @abstractmethod
    async def list(
        self,
        query: Dict[str, Any],
        page: Optional[int] = None,
        limit: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        pass

    @abstractmethod
    async def update(self, invoice_id: str, update_fields: Dict[str, Any]) -> None:
        pass

    @abstractmethod
    async def delete(self, invoice_id: str) -> None:
        pass
