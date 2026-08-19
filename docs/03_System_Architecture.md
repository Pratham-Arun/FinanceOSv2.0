# 🎨 FinanceOS Mermaid Diagrams

This document contains full Mermaid diagram definitions for system architecture, authentication flows, role-based workflows, rule engine evaluations, multi-agent orchestration, RAG query processing, and sequence diagrams.

---

## 🏗️ 1. Complete System Architecture

The diagram below illustrates the complete flow of authentication, role verification, rule evaluation, multi-agent orchestration, document retrieval, response generation, analytics collection, and persistent storage.

```mermaid
graph TD
    %% Frontend Layer
    subgraph Frontend["React Frontend (SPA)"]
        UI["User Interface (React / Tailwind)"]
        AuthCtx["Auth Context & RBAC Guards"]
        State["State Management & Axios HTTP Client"]
    end

    %% API & Security Gateway Layer
    subgraph Gateway["FastAPI Backend Gateway"]
        AuthMiddleware["JWT Authentication Middleware"]
        CorrID["X-Request-ID Correlation Middleware"]
        APIRouters["API Routers (Auth, Expenses, Approvals, AI, Admin)"]
    end

    %% Business & Service Layer
    subgraph CoreServices["Application Services Layer"]
        AuthSvc["Auth Service"]
        ExpSvc["Expense Service"]
        ApprSvc["Approval Service"]
        RuleEng["Rule Engine & Duplicate Detector"]
        ObsSvc["Enterprise Observability & Audit Logger"]
    end

    %% AI & Intelligence Abstraction Layer
    subgraph AISubsystem["AI / OCR & Intelligence Subsystem"]
        OCRFactory["OCR Provider Interface"]
        TesseractOCR["Tesseract OCR Engine"]
        LLMFactory["LLM Provider Interface"]
        GeminiLLM["Google Gemini 2.5 Flash"]
        LangGraph["LangGraph Multi-Agent Orchestrator"]
        RAGPipe["RAG Service Pipeline"]
    end

    %% Knowledge & Vector Search Layer
    subgraph KnowledgeBase["Policy Knowledge Base & RAG"]
        ChromaDB[("ChromaDB Vector Store")]
        PolicyDocs["Company Policy & Compliance Docs"]
    end

    %% Data & Storage Layer
    subgraph Persistence["Data & Storage Layer"]
        Repo["MongoDB Repository Layer (IRepository)"]
        MongoDB[("MongoDB Database")]
        FileStore["Receipt Upload Storage"]
    end

    %% Workflow Connections
    UI -->|HTTPS Requests| AuthMiddleware
    AuthMiddleware -->|Validate JWT Token| AuthCtx
    AuthMiddleware --> CorrID
    CorrID --> APIRouters
    
    APIRouters --> AuthSvc
    APIRouters --> ExpSvc
    APIRouters --> ApprSvc
    
    ExpSvc --> OCRFactory
    OCRFactory --> TesseractOCR
    ExpSvc --> RuleEng
    RuleEng --> LLMFactory
    LLMFactory --> GeminiLLM

    APIRouters --> LangGraph
    LangGraph --> RAGPipe
    RAGPipe --> PolicyDocs
    RAGPipe --> ChromaDB
    
    ExpSvc --> ObsSvc
    ApprSvc --> ObsSvc
    
    ExpSvc --> Repo
    ApprSvc --> Repo
    AuthSvc --> Repo
    
    Repo --> MongoDB
    ExpSvc -->|Save File| FileStore
```

---

## 🔐 2. Authentication & Authorization Flow

```mermaid
sequenceDiagram
    autonumber
    actor User as User / Client
    participant FE as React Frontend
    participant AuthRouter as Auth Router
    participant AuthSvc as Auth Service
    participant JWT as Security Utility
    participant Repo as User Repository
    participant DB as MongoDB

    User->>FE: Enter Credentials (Email & Password)
    FE->>AuthRouter: POST /api/auth/login
    AuthRouter->>AuthSvc: authenticate_user(email, password)
    AuthSvc->>Repo: get_by_email(email)
    Repo->>DB: Query User Collection
    DB-->>Repo: User Document (with hashed password)
    Repo-->>AuthSvc: User Object
    AuthSvc->>JWT: verify_password(plain_pwd, hashed_pwd)
    alt Invalid Password / User Not Found
        JWT-->>AuthSvc: False
        AuthSvc-->>AuthRouter: Raise HTTP 401 Unauthorized
        AuthRouter-->>FE: 401 Invalid Credentials
        FE-->>User: Show Login Error Alert
    else Credentials Valid
        JWT-->>AuthSvc: True
        AuthSvc->>JWT: create_access_token(user_id, role)
        JWT-->>AuthSvc: Signed JWT Token
        AuthSvc-->>AuthRouter: AuthResponse (Token + User Profile)
        AuthRouter-->>FE: HTTP 200 OK + JWT Bearer Token
        FE->>FE: Store Token in LocalStorage & Update AuthContext
        FE-->>User: Navigate to Role-Based Dashboard
    end
```

---

## 👤 3. Role-Based Workflows

### 👨‍💻 3.1 Employee Workflow

```mermaid
graph TD
    Start([Employee Starts Expense]) --> CreateDraft[Create Expense Form]
    CreateDraft --> UploadReceipt[Upload Receipt / Invoice Image]
    UploadReceipt --> OCRProcess[Trigger Tesseract OCR]
    OCRProcess --> AutoFill[Auto-fill Vendor, Amount, Date & Tax]
    AutoFill --> PolicyCheck[Run Client Pre-Validation]
    PolicyCheck --> SubmitClaim[Submit Claim for Manager Review]
    SubmitClaim --> TrackStatus[Track Status in Dashboard]
```

### 👨‍💼 3.2 Manager Workflow

```mermaid
graph TD
    ReceiveClaim([Claim Received in Queue]) --> ReviewDetails[Inspect Expense Details & Receipt]
    ReviewDetails --> ReviewOCR[Verify Extracted OCR Metadata]
    ReviewOCR --> ReviewAI[Check Policy Rule Engine & AI Fraud Score]
    ReviewAI --> Decision{Manager Decision}
    Decision -->|Approve| PassToFinance[Route Status to Approved / Finance Queue]
    Decision -->|Reject| NotifyEmployeeReject[Set Status Rejected & Notify Employee]
    Decision -->|Clarify| ReturnDraft[Request Clarification / Return to Draft]
```

### 💼 3.3 Financial Officer Workflow

```mermaid
graph TD
    ReceiveApproved([Approved Claim Enters Queue]) --> FinancialVerify[Verify Financial & Tax Information]
    FinancialVerify --> ReceiptCheck[Cross-check Receipt & Vendor Data]
    ReceiptCheck --> AuditReview[Inspect AI & Policy Audit Logs]
    AuditReview --> Action{Finance Action}
    Action -->|Disburse Payment| ProcessPayment[Execute Reimbursement & Issue TxID]
    ProcessPayment --> MarkPaid[Set Expense Status to Paid]
    Action -->|Flag Anomaly| FlagReject[Reject / Flag for Audit Investigation]
```

### 🛠️ 3.4 Admin Workflow

```mermaid
graph TD
    AdminStart([Admin Logs In]) --> Choice{Admin Dashboard Area}
    Choice -->|User Management| ManageUsers[Create / Modify User Roles & Managers]
    Choice -->|Policy Management| EditPolicies[Configure Category Spending Limits]
    Choice -->|Rule Engine| EditRules[Define Duplicate Windows & Thresholds]
    Choice -->|AI Configuration| ConfigAI[Configure AI Providers & Prompts]
    Choice -->|Audit Logs| InspectLogs[Review System & AI Observability Logs]
```

---

## 🔄 4. Complete Expense Lifecycle Sequence Diagram

```mermaid
sequenceDiagram
    autonumber
    actor Employee
    actor Manager
    actor Finance
    participant FE as React Frontend
    participant Gateway as FastAPI Router
    participant OCR as OCR Service
    participant RE as Rule Engine
    participant LLM as Gemini LLM AI
    participant DB as MongoDB Repository
    participant Obs as Audit Logger

    Employee->>FE: Upload Receipt File
    FE->>Gateway: POST /api/expenses/upload
    Gateway->>OCR: Process Image with Tesseract
    OCR-->>Gateway: Raw Extracted Text
    Gateway->>LLM: Structured JSON Extraction
    LLM-->>Gateway: Vendor, Amount, Date, Tax
    Gateway-->>FE: Pre-filled Expense Form
    
    Employee->>FE: Review & Submit Claim
    FE->>Gateway: POST /api/expenses
    Gateway->>RE: Run Policy Rules & Fraud Scoring
    RE-->>Gateway: Risk Level (Low/Med/High) & Flag Analysis
    Gateway->>DB: Save Expense (Status: Submitted)
    Gateway->>Obs: Record Audit Log Entry
    Gateway-->>FE: Expense Submitted Successfully

    Manager->>FE: Open Pending Manager Approvals Queue
    FE->>Gateway: GET /api/expenses/{id}
    Gateway->>DB: Fetch Claim Details
    DB-->>Gateway: Expense + AI Risk Report
    Gateway-->>FE: Render 3-Column Review Workspace
    Manager->>FE: Click Approve
    FE->>Gateway: POST /api/approvals/{id}/action (Approve)
    Gateway->>DB: Update Status to Approved
    Gateway->>Obs: Audit Log: Approved by Manager

    Finance->>FE: Open Finance Disburse Queue
    FE->>Gateway: GET /api/expenses?status=Approved
    Gateway->>DB: Fetch Approved Claims
    DB-->>Gateway: Claims List
    Gateway-->>FE: Display Claims
    Finance->>FE: Click Process Payment
    FE->>Gateway: POST /api/approvals/{id}/action (Pay)
    Gateway->>DB: Update Status to Paid + TxID
    Gateway->>Obs: Audit Log: Payment Disbursed
    Gateway-->>FE: Payment Confirmed
```

---

## ⚡ 5. Rule-Based Decision Engine Flow

```mermaid
graph TD
    Input[Incoming Expense Submission] --> CategoryCheck{Valid Policy Category?}
    CategoryCheck -->|No| FlagInvalidCat[Flag: Invalid Category Violation]
    CategoryCheck -->|Yes| FetchLimit[Fetch Category Max Threshold]
    
    FetchLimit --> AmountCheck{Amount > Category Max Limit?}
    AmountCheck -->|Yes| FlagLimitViolated[Flag: Expense Limit Exceeded]
    AmountCheck -->|No| ReceiptCheck{Receipt Required & Provided?}
    
    ReceiptCheck -->|Missing| FlagReceiptMissing[Flag: Mandatory Receipt Missing]
    ReceiptCheck -->|Valid| DupCheck{Duplicate Vendor, Amount & Date within N Days?}
    
    DupCheck -->|Found| FlagDuplicate[Flag: High-Probability Duplicate Claim]
    DupCheck -->|Clear| CalculateScore[Aggregate Risk Score & Confidence]
    
    FlagInvalidCat --> CalculateScore
    FlagLimitViolated --> CalculateScore
    FlagReceiptMissing --> CalculateScore
    FlagDuplicate --> CalculateScore
    
    CalculateScore --> RiskEval{Total Risk Points}
    RiskEval -->|Score >= 70| HighRisk[Risk Level: High -> Require Manager Action]
    RiskEval -->|30 <= Score < 70| MedRisk[Risk Level: Medium -> Caution Flag]
    RiskEval -->|Score < 30| LowRisk[Risk Level: Low -> Fast-Track Eligible]
```

---

## 🤖 6. LangGraph Multi-Agent Workflow

```mermaid
graph TD
    UserQuery([User Query / Expense Trigger]) --> Supervisor[Supervisor Agent Router]
    
    Supervisor -->|Policy Question| PolicyAgent[Policy Compliance Agent]
    Supervisor -->|OCR / Receipt Question| OCRAgent[OCR Data Verification Agent]
    Supervisor -->|Risk / Audit Question| FraudAgent[Fraud & Anomaly Agent]
    
    PolicyAgent --> ToolRAG[Query RAG Policy Vector Base]
    OCRAgent --> ToolOCR[Inspect OCR Extracted Tokens]
    FraudAgent --> ToolAudit[Query Audit Logs & Duplicate Engine]
    
    ToolRAG --> PolicyAgent
    ToolOCR --> OCRAgent
    ToolAudit --> FraudAgent
    
    PolicyAgent --> Synthesizer[Response Synthesizer Node]
    OCRAgent --> Synthesizer
    FraudAgent --> Synthesizer
    
    Synthesizer --> FinalOutput([Return Grounded Explainable Recommendation])
```

---

## 🧠 7. AI Query Processing & Forced Routing

```mermaid
graph TD
    IncomingQuery[Incoming User Prompt] --> IntentClassifier{Intent Classification}
    
    IntentClassifier -->|Policy FAQ| RouteRAG[Force Route: RAG Pipeline]
    IntentClassifier -->|Expense Status| RouteDB[Force Route: Database Query Service]
    IntentClassifier -->|Receipt Audit| RouteOCR[Force Route: OCR Analysis Service]
    IntentClassifier -->|General / Other| RouteLLM[Force Route: Base LLM Guardrails]
    
    RouteRAG --> RetrieveDocs[Retrieve Policy Chunks from Vector DB]
    RetrieveDocs --> GroundedPrompt[Construct Grounded Context Prompt]
    GroundedPrompt --> GenerateAnswer[Generate AI Copilot Answer]
    
    RouteDB --> QueryDB[Execute User-Scoped DB Retrieval]
    QueryDB --> FormatStatus[Format Claim Status Response]
    
    RouteOCR --> FetchOCR[Retrieve Receipt OCR Bounding Blocks]
    FetchOCR --> AnalyzeOCR[Evaluate Extraction Quality]
    
    RouteLLM --> SystemGuard[Apply Enterprise Policy Guardrails]
    SystemGuard --> SafeResponse[Generate Safe System Answer]

    GenerateAnswer --> FormatOutput[Format Standard JSON/Markdown Response]
    FormatStatus --> FormatOutput
    AnalyzeOCR --> FormatOutput
    SafeResponse --> FormatOutput
```

---

## 📚 8. Retrieval-Augmented Generation (RAG) Pipeline

```mermaid
graph TD
    subgraph Ingestion["Document Ingestion & Indexing"]
        Docs[Company Policy Documents] --> TextSplitter[Recursive Character Text Splitter]
        TextSplitter --> Chunking[Document Chunks: 500 tokens, 50 overlap]
        Chunking --> EmbedModel[Embedding Model: HuggingFace / OpenAI]
        EmbedModel --> VectorStore[ChromaDB Vector Store]
    end

    subgraph Retrieval["Query Retrieval & Grounding"]
        UserQ[Employee Policy Query] --> QueryEmbed[Embed Query String]
        QueryEmbed --> SimilaritySearch[Vector Similarity Search: Cosine Top-K=4]
        VectorStore --> SimilaritySearch
        SimilaritySearch --> RelevantChunks[Relevant Policy Excerpts]
    end

    subgraph Generation["Grounded Response Generation"]
        RelevantChunks --> PromptTemplate[Construct Grounded RAG Prompt]
        UserQ --> PromptTemplate
        PromptTemplate --> LLMEngine[Google Gemini 2.5 Flash]
        LLMEngine --> GroundedAnswer[Generate Grounded Response + Policy Citations]
    end
```
