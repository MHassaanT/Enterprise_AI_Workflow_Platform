# Multi-Agent Platform: Sales, Finance, and Procurement Agents System Report

## 1. Executive Summary

The **Enterprise AI Workflow Platform** deploys an advanced, multi-tenant multi-agent architecture powered by **LangGraph**, **FastAPI**, **Node.js Express**, and **Next.js**. Among its operational core are three specialized domain agents:

1. **Sales Agent**: Manages customer leads, automates enterprise quote generation with strict policy-driven discount guardrails (max 15%), orchestrates deal negotiation approval gates, and synchronizes forecasted revenue directly into the company's financial ledger.
2. **Finance Agent**: Handles invoice ingestion and OCR/parsing, performs automated two-way/three-way reconciliation against Purchase Orders (POs), flags price/quantity discrepancies, manages human approval gates for payments, executes vendor payments, updates the general ledger, and provides real-time departmental budget clearance.
3. **Procurement Agent**: Ingests vendor equipment bids, performs RAG-based compliance checks against purchasing guidelines, executes cross-agent budget verification directly via the Finance Agent, generates human approval requests for Purchase Orders, issues official POs upon authorization, and dispatches POs to vendors.

These three domain agents are managed individually as LangGraph StateGraphs and can also be dynamically orchestrated by a top-level **Supervisor Agent** (`supervisor_graph`) for cross-departmental operations.

---

## 2. System Architecture & Multi-Agent Network

```
                                      +------------------------------------+
                                      |     Next.js Web Frontend           |
                                      |  (/sales, /finance, /procurement)  |
                                      +-----------------+------------------+
                                                        |
                                                        v  HTTP REST API
                                      +-----------------+------------------+
                                      |     Node.js Express Backend        |
                                      |  (/api/v1/sales, /finance, etc.)   |
                                      +--------+------------------+--------+
                                               |                  |
                            PostgreSQL DB      |                  |  X-Internal-Token Auth
                                               v                  v
                                    +----------+----+    +--------+------------------+
                                    | PostgreSQL DB |    |  Python FastAPI Service   |
                                    |  (Tables)     |    |  (:8000)                  |
                                    +---------------+    +--------+------------------+
                                                                  |
                                              +-------------------+-------------------+
                                              |                   |                   |
                                              v                   v                   v
                                     +-----------------+ +-----------------+ +-----------------+
                                     |  Sales Agent    | |  Finance Agent  | | Procurement Agt |
                                     |  StateGraph     | |  StateGraph     | | StateGraph      |
                                     +--------+--------+ +--------+--------+ +--------+--------+
                                              |                   |                   |
                                              +-------------------+-------------------+
                                                                  |
                                                        Qdrant RAG & MCP Tools
                                              +-------------------+-------------------+
                                              | - Vector Policy Storage (Qdrant)      |
                                              | - Sales / Finance / Procurement MCPs  |
                                              +---------------------------------------+
```

---

## 3. Deep-Dive Agent Specifications

### 3.1 Sales Agent

#### Primary Capabilities & Business Logic
* **Lead Ingestion & CRM Lookup**: Retrieves existing CRM records or initializes new customer leads.
* **Policy-Enforced Quote Draft**: Queries Qdrant RAG for pricing policies. Applies a mandatory guardrail: **maximum allowed discount is capped at 15%** regardless of user request.
* **Deal Negotiation Approval Gate**: If a custom contract or quote is produced, an `approval_requests` record (`action_type: 'finalize_sales_contract'`) is generated for Sales Manager authorization.
* **CRM Deal Stage Updates**: Upon approval, automatically updates lead deal status to `'Closed Won'`.
* **Cross-Agent Financial Sync**: Invokes Finance MCP tools (`update_general_ledger_impl`) to write forecasted sales revenue (`ACC-4000`) into the general ledger.

#### Graph Nodes & Execution Pipeline
* **`lead_pricing` Node**: Looks up lead in CRM via `fetch_lead_history_impl`, queries policy context from Qdrant RAG, calculates final annual pricing, and enforces the $\le 15\%$ discount cap.
* **`deal_negotiation` Node**: Checks approval status. If unapproved, creates a pending `approval_requests` entry. Once approved, executes `update_deal_stage_impl` to set stage to `'Closed Won'`.
* **`sales_financial_sync` Node**: Executes cross-agent ledger update for `REVENUE_FORECAST` and logs transaction details to `audit_logs`.

#### State Schema (`SalesAgentState`)
```python
class SalesAgentState(TypedDict):
    tenant_id: str
    conversation_id: str
    user_id: str
    subagent_target: str  # 'lead_pricing' | 'deal_negotiation' | 'sales_financial_sync' | 'auto'
    customer_email: str
    tier_requested: str
    requested_discount: Optional[float]
    lead_data: Optional[Dict[str, Any]]
    rag_policy_context: Optional[List[Dict[str, Any]]]
    citations: List[Dict[str, Any]]
    quote_details: Optional[Dict[str, Any]]
    customer_accepted: bool
    approval_id: Optional[str]
    approval_status: Optional[str]  # 'pending' | 'approved' | 'rejected'
    deal_stage: Optional[str]        # 'Closed Won' | 'CONTRACT_PENDING'
    financial_sync_result: Optional[Dict[str, Any]]
    answer: str
    audit_logged: bool
```

---

### 3.2 Finance Agent

#### Primary Capabilities & Business Logic
* **Invoice Parsing & RAG Context**: Ingests vendor invoices and searches Qdrant for invoice/payment rules and minimum PO thresholds.
* **PO Matching & Reconciliation Audit**: Performs matching between incoming invoices and existing database Purchase Orders.
  * **Matched**: Status set to `RECONCILED`; creates an `approval_requests` entry (`action_type: 'execute_payment'`) for Finance Manager approval.
  * **Mismatched / Missing PO**: Flags status as `FLAGGED_FOR_DISCREPANCY`, records specific anomalies (e.g., price mismatch, missing PO), and drafts vendor clarification notices.
* **Payment Execution**: Post-approval, executes vendor payment via `execute_payment_impl`, marks invoice as `PAID`, and logs actual expense (`ACC-5000`) in `general_ledger`.
* **Departmental Budget Allocation & Clearance**: Evaluates department budgets, checks available funds ($\text{Total} - \text{Spent} - \text{Reserved}$), and grants or denies budget clearance tokens (`CLR-DEPT-AMOUNT`).

#### Graph Nodes & Execution Pipeline
* **`invoice_ingestion` Node**: Extracts invoice details, searches RAG vector store, and fetches PO record via `fetch_po_details_impl`.
* **`invoice_reconciliation` Node**: Compares total invoice amount against PO amount. Inserts/updates invoice record in PostgreSQL and generates pending approval request for matched items.
* **`payment_execution` Node**: Invokes payment tool upon approval, updates invoice state to `PAID`, updates general ledger, and creates audit log.
* **`budget_clearance` Node**: Queries `department_budgets`, updates `reserved_amount` if funds exist, issues clearance token, and logs audit record.

#### State Schema (`FinanceAgentState`)
```python
class FinanceAgentState(TypedDict):
    tenant_id: str
    conversation_id: str
    user_id: str
    subagent_target: str  # 'invoice_ingestion' | 'invoice_reconciliation' | 'payment_execution' | 'budget_clearance' | 'auto'
    invoice_data: Optional[Dict[str, Any]]
    po_number: Optional[str]
    department: Optional[str]
    clearance_amount: Optional[float]
    rag_policy_context: Optional[List[Dict[str, Any]]]
    po_record: Optional[Dict[str, Any]]
    match_status: Optional[str]  # 'RECONCILED' | 'FLAGGED_FOR_DISCREPANCY'
    anomalies: Optional[List[str]]
    payment_draft: Optional[Dict[str, Any]]
    approval_id: Optional[str]
    approval_status: Optional[str]  # 'pending' | 'approved' | 'rejected'
    payment_result: Optional[Dict[str, Any]]
    budget_clearance_result: Optional[Dict[str, Any]]
    answer: str
    citations: List[Dict[str, Any]]
    audit_logged: bool
```

---

### 3.3 Procurement Agent

#### Primary Capabilities & Business Logic
* **Vendor Bid Ingestion**: Accepts vendor equipment quotes and logs details in `procurement_bids`.
* **RAG Compliance Check**: Validates bid specifications against procurement guidelines ($\le \$250,000$ limit for standard compliance).
* **Inter-Agent Budget Verification**: Directly delegates budget verification to the **Finance Agent Graph** (`finance_head_graph`) to confirm remaining budget before proceeding.
* **Human Approval & PO Issuance**: Generates an `approval_requests` entry (`action_type: 'create_purchase_order'`). Upon human approval, creates an official PO record (`PO-2026-XXXX`) in PostgreSQL and dispatches vendor notifications.

#### Graph Nodes & Execution Pipeline
* **`vendor_bid` Node**: Parses bid payload, queries Qdrant purchasing policies, determines compliance status (`COMPLIANT` vs `NON_COMPLIANT`), and saves record to `procurement_bids`.
* **`procurement_budget` Node**: Executes an internal sub-invocation of `finance_head_graph` (target: `budget_clearance`). Returns clearance status and token.
* **`po_execution` Node**: Evaluates human approval state. Generates approval request if pending. Upon approval, invokes `create_purchase_order_impl` to create the PO record and dispatches email notification.

#### State Schema (`ProcurementAgentState`)
```python
class ProcurementAgentState(TypedDict):
    tenant_id: str
    conversation_id: str
    user_id: str
    subagent_target: str  # 'vendor_bid' | 'procurement_budget' | 'po_execution' | 'auto'
    bid_data: Optional[Dict[str, Any]]
    department: Optional[str]
    rag_policy_context: Optional[List[Dict[str, Any]]]
    citations: List[Dict[str, Any]]
    compliance_status: Optional[str]  # 'COMPLIANT' | 'NON_COMPLIANT'
    budget_clearance_status: Optional[str]  # 'APPROVED' | 'REJECTED'
    budget_clearance_token: Optional[str]
    approval_id: Optional[str]
    approval_status: Optional[str]
    po_record: Optional[Dict[str, Any]]
    answer: str
    audit_logged: bool
```

---

## 4. Cross-Domain Inter-Agent Workflows

```
  +--------------------+         +-----------------------+         +---------------------+
  |   Procurement      |         |     Finance Agent     |         |     Sales Agent     |
  |      Agent         |         |      (Clearance)      |         |     (Deal Won)      |
  +---------+----------+         +-----------+-----------+         +----------+----------+
            |                                |                                |
            | 1. Delegate Budget Check       |                                |
            +------------------------------->|                                |
            |    (clearance_amount, dept)    |                                |
            |                                |                                |
            | 2. Returns Token / Status      |                                |
            |<-------------------------------+                                |
            |                                                                 |
            | 3. PO Approved & Created                                        |
            |    (Stored in purchase_orders)                                  |
            |                                                                 |
            | 4. Invoice Arrives & Matched against PO                         |
            +---------------------------------------------------------------->|
                                                                              | 5. Forecast Revenue
                                                                              |    to General Ledger
```

1. **Procurement $\rightarrow$ Finance Budget Verification**: When a vendor bid is ingested, the Procurement Agent invokes `finance_head_graph` with `subagent_target="budget_clearance"`. The Finance Agent verifies funds, reserves the amount, and issues a clearance token back to Procurement.
2. **Procurement $\rightarrow$ PO Execution $\rightarrow$ Finance Invoicing**: Once the Procurement PO is approved and created in `purchase_orders`, any future incoming invoice processed by the Finance Agent will automatically reconcile against this PO.
3. **Sales $\rightarrow$ Finance General Ledger Sync**: Upon deal approval, the Sales Agent updates the CRM deal stage to `'Closed Won'` and directly updates the Finance General Ledger with forecasted revenue.

---

## 5. PostgreSQL Database Schema Reference

| Table Name | Description | Key Columns |
| :--- | :--- | :--- |
| `crm_leads` | CRM sales opportunities & deal stages | `id`, `tenant_id`, `lead_id`, `customer_name`, `customer_email`, `company`, `deal_stage`, `total_value`, `discount_rate` |
| `invoices` | Ingested vendor invoices & match statuses | `id`, `tenant_id`, `invoice_number`, `po_number`, `vendor_name`, `vendor_email`, `total_amount`, `match_status`, `anomalies`, `status` |
| `purchase_orders` | Executed Purchase Orders | `id`, `tenant_id`, `po_number`, `vendor_name`, `vendor_email`, `amount`, `line_items`, `status` |
| `procurement_bids` | Ingested vendor equipment quotes | `id`, `tenant_id`, `bid_reference`, `vendor_name`, `vendor_email`, `quote_amount`, `equipment_details`, `compliance_status` |
| `general_ledger` | Financial transactions & revenue forecasts | `id`, `tenant_id`, `account_code`, `account_name`, `transaction_type`, `forecasted_revenue`, `actual_revenue`, `actual_expense`, `reference_id` |
| `department_budgets`| Departmental budget limits & balances | `id`, `tenant_id`, `department`, `total_budget`, `spent_amount`, `reserved_amount` |
| `approval_requests` | Human-in-the-loop authorization gates | `id`, `tenant_id`, `action_type`, `status`, `details`, `requester_id`, `resolved_at` |
| `audit_logs` | System-wide audit trail | `id`, `tenant_id`, `agent_name`, `subagent_name`, `action`, `details`, `reasoning`, `citations` |

---

## 6. Endpoints Reference

### Public API Endpoints (Node.js Backend)

* **Sales Hub**:
  * `GET /api/v1/sales/leads` — Retrieve CRM leads for current tenant.
  * `POST /api/v1/sales/request-quote` — Triggers Sales Agent (`lead_pricing` $\rightarrow$ `deal_negotiation` $\rightarrow$ `sales_financial_sync`).
* **Finance Hub**:
  * `GET /api/v1/finance/invoices` — List all invoice records.
  * `GET /api/v1/finance/ledger` — Fetch General Ledger entries.
  * `GET /api/v1/finance/budgets` — List department budgets.
  * `POST /api/v1/finance/process-invoice` — Triggers Finance Agent invoice ingestion and PO reconciliation.
* **Procurement Hub**:
  * `GET /api/v1/procurement/bids` — Fetch submitted vendor bids.
  * `GET /api/v1/procurement/purchase-orders` — List generated Purchase Orders.
  * `POST /api/v1/procurement/submit-bid` — Submits bid, performs RAG compliance check, and executes cross-agent budget verification.
* **Approvals & Governance**:
  * `GET /api/approvals/pending` — Fetch pending human authorization requests.
  * `POST /api/approvals/:id/action` — Submit approval decision (`approved` / `rejected`).

### Agent Microservice Endpoints (Python FastAPI `:8000`)
* `POST /agent/sales/run` — Executes Sales Head StateGraph.
* `POST /agent/finance/run` — Executes Finance Head StateGraph.
* `POST /agent/procurement/run` — Executes Procurement Head StateGraph.
* `POST /agent/supervisor/run` — Executes Central Supervisor Orchestrator Graph.
* `POST /agent/resume` — Resumes paused agent execution thread following human approval decision.

*(Note: All inter-service requests between Node.js and FastAPI require the `X-Internal-Token` HTTP header).*
