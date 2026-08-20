# AI Sales Agent V2 Upgradation Report

**System Domain**: AI Sales SDR Agent & Inter-Agent Financial Integration  
**Date**: August 20, 2026  
**Status**: Production Ready & Fully Integrated  

---

## 1. Executive Summary

This report documents the architectural upgrade of the **AI Sales SDR Agent** within the Enterprise AI Workflow Platform. The upgrade enhances the Sales Agent from a simple one-way email outreach agent into an **end-to-end autonomous sales pipeline** capable of:
1. **Email Reply Tracking & AI Counter-Responses**: Monitoring inbound prospect emails, analyzing sentiment/intent with LLMs, and generating contextual sales reply copy.
2. **Proposal & Master Services Agreement Drafting (Human-in-the-Loop Approval)**: Generating formal B2B Proposals & Agreements and enforcing a mandatory human review step before dispatch.
3. **Sales Performance Dashboarding**: Aggregating real-time KPI metrics including prospects contacted, reply rates, closed sales, conversion rates, and revenue pipeline.
4. **Sales-to-Finance Reporting & Inter-Agent Notification**: Automatically generating Sales Completion Reports upon deal closure and populating the **Finance Agent's** General Ledger (`general_ledger`), Customer Invoice Registry (`invoices`), and cross-agent audit logs (`audit_logs`).

---

## 2. Architecture & Operational Lifecycle Workflow

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              AI SALES SDR AGENT PIPELINE                               │
└────────────────────────────────────────────────────────────────────────────────────────┘
                                           │
                                           ▼
                       ┌──────────────────────────────────────┐
                       │ 1. Lead Sourcing & Verification      │
                       │    (Hunter.io API Adapter)           │
                       └──────────────────────────────────────┘
                                           │
                                           ▼
                       ┌──────────────────────────────────────┐
                       │ 2. Initial Outreach Email            │
                       │    (Personalized LLM Copy)           │
                       └──────────────────────────────────────┘
                                           │
                                           ▼
                       ┌──────────────────────────────────────┐
                       │ 3. Email Reply Check & AI Reply      │
                       │    (Gmail API + Sentiment LLM)       │
                       └──────────────────────────────────────┘
                                           │
                                           ▼
                       ┌──────────────────────────────────────┐
                       │ 4. Draft B2B Proposal & Agreement    │
                       │    (JSON Contract Engine)            │
                       └──────────────────────────────────────┘
                                           │
                                           ▼
             ═════════════════════════════════════════════════════════
             🛑 PIPELINE PAUSED: WAITS FOR HUMAN UI APPROVAL TO SEND
             ═════════════════════════════════════════════════════════
                                           │
                                           ▼ (Human Clicks "Approve & Send")
                       ┌──────────────────────────────────────┐
                       │ 5. Proposal Sent to Prospect         │
                       └──────────────────────────────────────┘
                                           │
                                           ▼ (Prospect Accepts / Closed Won)
                       ┌──────────────────────────────────────┐
                       │ 6. Sale Confirmation & Report Gen    │
                       └──────────────────────────────────────┘
                                           │
                                           ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              CROSS-AGENT FINANCE INTEGRATION                            │
├──────────────────────────────────┬──────────────────────────────────┬──────────────────┤
│ 1. General Ledger (`REV-SALES-101`)│ 2. Customer Invoice (`INV-REP...`)│ 3. Audit Logs    │
└──────────────────────────────────┴──────────────────────────────────┴──────────────────┤
```

---

## 3. Database Schema Updates

Migration `backend/database/migrations/026_sales_agent_v2_schema.sql` extends the `sales_prospects` table to support reply state, contract details, financial values, and deal reports:

```sql
-- Migration 026: Sales Agent V2 Schema
ALTER TABLE sales_prospects ADD COLUMN IF NOT EXISTS has_reply BOOLEAN DEFAULT FALSE;
ALTER TABLE sales_prospects ADD COLUMN IF NOT EXISTS last_reply_at TIMESTAMPTZ;
ALTER TABLE sales_prospects ADD COLUMN IF NOT EXISTS reply_content TEXT;
ALTER TABLE sales_prospects ADD COLUMN IF NOT EXISTS ai_reply_draft TEXT;
ALTER TABLE sales_prospects ADD COLUMN IF NOT EXISTS reply_status VARCHAR(50) DEFAULT 'NO_REPLY'; 
ALTER TABLE sales_prospects ADD COLUMN IF NOT EXISTS proposal_details JSONB DEFAULT '{}'::jsonb;
ALTER TABLE sales_prospects ADD COLUMN IF NOT EXISTS proposal_status VARCHAR(50) DEFAULT 'NONE'; 
ALTER TABLE sales_prospects ADD COLUMN IF NOT EXISTS deal_value NUMERIC(15, 2) DEFAULT 0.00;
ALTER TABLE sales_prospects ADD COLUMN IF NOT EXISTS sales_report JSONB DEFAULT '{}'::jsonb;

-- Indexes for querying performance
CREATE INDEX IF NOT EXISTS idx_sales_prospects_reply_status ON sales_prospects(reply_status);
CREATE INDEX IF NOT EXISTS idx_sales_prospects_proposal_status ON sales_prospects(proposal_status);
```

---

## 4. Backend Fast-API Agent Layer (`agent/routers/sales_agent.py`)

Six new production FastAPI endpoints were implemented in `sales_agent.py`:

### 1. `POST /agent/sales/check-replies`
- Queries Gmail API inbox or simulated test payload for inbound messages from prospects.
- Invokes LLM (`get_llm()`) to parse intent, sentiment, and draft an executive counter-reply.
- Updates prospect `has_reply = TRUE`, `reply_content`, `ai_reply_draft`, and transitions `deal_stage` to `REPLIED` or `PROPOSAL_REQUESTED`.

### 2. `POST /agent/sales/send-reply`
- Dispatches the approved AI counter-reply to the prospect via Gmail API adapter.
- Updates prospect `reply_status = 'AI_REPLIED'` and stores `gmail_message_id`.

### 3. `POST /agent/sales/proposals/draft`
- Generates a structured JSON proposal containing executive summary, pricing tier, SLA clauses, deliverables, and payment terms.
- Stores proposal in `sales_prospects.proposal_details` and sets `proposal_status = 'DRAFTED'`.
- **Enforces Pipeline Pause**: Halts execution for human verification.

### 4. `POST /agent/sales/proposals/send`
- Dispatches the formatted proposal agreement email to the prospect upon human approval in the UI.
- Sets `proposal_status = 'SENT'` and `deal_stage = 'PROPOSAL_SENT'`.

### 5. `GET /agent/sales/analytics/{tenant_id}`
- Computes aggregate metrics from `sales_prospects`:
  - `contacted_count`: Count of prospects outreached.
  - `replied_count`: Count of prospects who replied (and reply rate %).
  - `sales_completed_count`: Count of `CLOSED_WON` deals (and conversion rate %).
  - `total_revenue`: Total revenue from closed deals ($).
  - `active_pipeline_value`: Total value of active proposals ($).

### 6. `POST /agent/sales/deal/confirm-sale`
- Marks deal as `CLOSED_WON` and builds a structured **Sales Completion Report**.
- Triggers **Inter-Agent Finance Notification**:
  - Inserts revenue record into `general_ledger` (`account_code = 'REV-SALES-101'`).
  - Creates customer invoice in `invoices` table (`status = 'APPROVED'`, `match_status = 'RECONCILED'`).
  - Writes cross-agent audit record to `audit_logs` (`action = 'NOTIFY_FINANCE_SALE_CLOSED'`).

---

## 5. Backend Express Proxy Middleware (`backend/src/routes/sales.js`)

The Express backend forwards client UI requests to the FastAPI agent backend with security headers and timeout handling:
- `POST /api/v1/sales/check-replies`
- `POST /api/v1/sales/send-reply`
- `POST /api/v1/sales/proposals/draft`
- `POST /api/v1/sales/proposals/send`
- `GET /api/v1/sales/analytics`
- `POST /api/v1/sales/deal/confirm-sale`

---

## 6. Frontend Sales Dashboard (`frontend/src/app/sales/page.js`)

The Next.js dashboard was refactored with a modern UI design system:

### 1. Top KPI Analytics Header
- **Prospects Contacted**: Total leads outreached.
- **Replies Received**: Total responses and reply rate percentage.
- **Sales Completed**: Total closed deals and conversion rate percentage.
- **Revenue / Pipeline**: Total closed revenue and active proposal pipeline.

### 2. Multi-Tab Navigation Workspace
- **Prospects Tab**: View current and past run leads, with direct **Draft Proposal** and **Close Sale** quick actions.
- **Email Replies Tab**: View inbound prospect emails, LLM sentiment analysis, and generated AI reply drafts with a **Send AI Reply** action.
- **Proposals & Agreements Tab**: Inspect drafted agreements, deliverables, pricing tiers, and SLA clauses. Contains the **Human-in-the-Loop "Approve & Send Proposal"** button.
- **Sales & Finance Tab**: Displays completed deals, Sales Completion Reports, and Finance Agent General Ledger/Invoice sync status (`✓ GL Ledger & Invoice Created`).
- **ICP Strategy Tab**: View Knowledge Base-grounded Ideal Customer Profile settings.
- **Audit Logs Tab**: Detailed execution log history.

### 3. Key Bug Fix & JSON Truthiness Filtering
- **Issue**: Default PostgreSQL empty JSON values (`'{}'::jsonb`) were evaluating to `true` in JavaScript (`Boolean({}) === true`), causing all prospects to appear in Proposals and Sales tabs simultaneously.
- **Fix**: Implemented `hasValidJsonData()` helper function to strictly validate JSON length and verify `proposal_status !== 'NONE'` and `deal_stage === 'CLOSED_WON'`.

---

## 7. Verification & Automated Testing

Verification was conducted via `scratch/verify_sales.js`:
- ✅ Database columns verified in PostgreSQL `sales_prospects`.
- ✅ Reply check and AI draft generation verified.
- ✅ Proposal generation held in `DRAFTED` state for human review.
- ✅ Sale confirmation tested: Sales Completion Report generated, `general_ledger` revenue inserted (`REV-SALES-101`), and customer invoice created (`INV-REP-SALE-...`).
- ✅ Analytics query verified: Total prospects, contacted, replied, sales completed, and revenue calculated accurately.

---

## 8. Summary of Upgraded Files

| File Path | Description |
| :--- | :--- |
| `backend/database/migrations/026_sales_agent_v2_schema.sql` | SQL schema migration for reply, proposal, and finance columns |
| `agent/routers/sales_agent.py` | FastAPI backend routes for replies, proposals, analytics, and finance sync |
| `backend/src/routes/sales.js` | Express proxy middleware endpoints |
| `agent/graph/sales/nodes/dispatch_closing.py` | Node update initializing deal value during CRM sync |
| `frontend/src/app/sales/page.js` | Next.js Sales Dashboard with analytics header, tabs, and human approval flow |
| `docs/sales_agent_v2_upgradation_report.md` | Comprehensive technical upgrade documentation report |
