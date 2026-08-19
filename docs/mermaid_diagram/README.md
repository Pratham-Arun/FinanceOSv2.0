# 🎨 FinanceOS Mermaid Diagrams (Verified & Corrected)

This directory contains standalone, 100% syntactically valid `.mmd` code files representing the actual architecture and workflows implemented in the FinanceOS application.

---

## 📁 Diagram Files Index

| Diagram Name | File Path | Description / Actual Flow |
|---|---|---|
| **System Architecture** | [`system_architecture.mmd`](file:///c:/Users/Pratham%20arun/source/repos/Finance/docs/mermaid_diagram/system_architecture.mmd) | Decoupled client-backend services, MongoDB repos, Tesseract OCR, and Gemini RAG pipeline. |
| **Authentication & Authorization** | [`auth_flow.mmd`](file:///c:/Users/Pratham%20arun/source/repos/Finance/docs/mermaid_diagram/auth_flow.mmd) | Credentials check, MongoDB lookup, JWT issuance, middleware guards, and RBAC landing. |
| **Employee Workflow** | [`employee_workflow.mmd`](file:///c:/Users/Pratham%20arun/source/repos/Finance/docs/mermaid_diagram/employee_workflow.mmd) | Submission flow, OCR extraction, rule engine checks, duplicate detection, and AI analysis. |
| **Manager Workflow** | [`manager_workflow.mmd`](file:///c:/Users/Pratham%20arun/source/repos/Finance/docs/mermaid_diagram/manager_workflow.mmd) | Queue inspection, loading AI risk evaluations, and approving/rejecting/clarifying. |
| **Financial Officer Workflow** | [`finance_workflow.mmd`](file:///c:/Users/Pratham%20arun/source/repos/Finance/docs/mermaid_diagram/finance_workflow.mmd) | Financial compliance verification, disbursing reimbursement, audit logger, and database writes. |
| **Admin Workflow** | [`admin_workflow.mmd`](file:///c:/Users/Pratham%20arun/source/repos/Finance/docs/mermaid_diagram/admin_workflow.mmd) | Management of users, policies, AI configuration runtime variables, RAG policy uploads, and audit metrics. |
| **Rule-Based Decision Engine** | [`rule_engine.mmd`](file:///c:/Users/Pratham%20arun/source/repos/Finance/docs/mermaid_diagram/rule_engine.mmd) | Policy categorization (Meals, Hotel, Travel, Receipt requirements, Duplicates) and review triggers. |
| **AI Copilot Orchestration** | [`ai_copilot_orchestration.mmd`](file:///c:/Users/Pratham%20arun/source/repos/Finance/docs/mermaid_diagram/ai_copilot_orchestration.mmd) | Real intent-based router in `chat_service.py` that delegates to RAG, status, or rejection checks. |
| **AI Query Processing & Routing**| [`ai_query_routing.mmd`](file:///c:/Users/Pratham%20arun/source/repos/Finance/docs/mermaid_diagram/ai_query_routing.mmd) | Query evaluation logic and grounded prompt builder inside the backend services. |
| **RAG Pipeline** | [`rag_pipeline.mmd`](file:///c:/Users/Pratham%20arun/source/repos/Finance/docs/mermaid_diagram/rag_pipeline.mmd) | Seeding & document ingest, MongoDB text indexing, Cosine similarity matches, and prompt generation. |
| **Complete Expense Lifecycle** | [`expense_lifecycle.mmd`](file:///c:/Users/Pratham%20arun/source/repos/Finance/docs/mermaid_diagram/expense_lifecycle.mmd) | End-to-end lifecycle flow from creation to payment and final dashboard reporting. |
