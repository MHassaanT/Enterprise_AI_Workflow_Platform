# Technical Report: Production-Ready AI Sales Agent (AI SDR/BDR)

## Executive Summary

This document details the architectural redesign and full production implementation of the **AI Sales Agent (AI SDR/BDR)** within the Enterprise AI Workflow Platform.

The legacy Sales Agent has been completely removed and replaced with a modern, credit-efficient, autonomous B2B sales development engine. Operating on a **4-Stage Functional Framework** and an optimized **6-Stage Execution Pipeline Architecture**, the AI Sales SDR Agent autonomously handles prospect discovery, deep account research, deliverability validation, structured scoring, hyper-personalized copy/quote generation, and multi-channel outreach dispatch with full CRM pipeline tracking.

---

## 1. 4-Stage Functional Framework

```
  ┌─────────────────────────────────────────────────────────────────────────┐
  │                        AI SALES AGENT (SDR/BDR)                         │
  └─────────────────────────────────────────────────────────────────────────┘
        │
        ├── 1. UNDERSTAND BUSINESS
        │   ├── Ingests ICP criteria (target industries, titles, company headcount range)
        │   ├── Loads competitor battlecard differentiators & sales playbooks
        │   └── Resolves pricing tiers & value proposition rules
        │
        ├── 2. RESEARCH LEADS
        │   ├── Queries raw candidate accounts via Apollo API without burning credits
        │   ├── Scrapes target company website using Crawl4AI (or HTTP fallback)
        │   └── Verifies active B2B business model, pricing, and pain points early
        │
        ├── 3. CONTACT PROSPECTS
        │   ├── Finds direct decision-maker contacts via Apollo Contact Discovery
        │   ├── Runs Email Verifier deliverability guard (RFC 5322, MX DNS, disposable filter)
        │   └── Synthesizes insights & drafts personalized outreach copy via OpenRouter LLM
        │
        └── 4. DEAL HANDLING
            ├── Dispatches cold hook sequences or quotes via Gmail API
            ├── Logs verified prospects and deal stages to PostgreSQL CRM
            └── Updates deal pipeline (DISCOVERED -> QUALIFIED -> OUTREACH_SENT -> CLOSED_WON)
```

---

## 2. Optimized 6-Stage Execution Pipeline Architecture

| Stage | Pipeline Action | Tool / Service | Purpose |
| :--- | :--- | :--- | :--- |
| **1. Sourcing** | Query raw target accounts by ICP criteria. | Apollo API (`apollo_mcp.py`) | Discovers candidate companies and role titles without burning email credits. |
| **2. Account Fit Check** | Scrape website to verify active business model & pain points. | Crawl4AI (`agent/routers/tools.py`) | Discards non-qualifying companies early before paying for email contact finding. |
| **3. Contact Discovery** | Find work email and phone numbers via waterfall search. | Apollo API Contact Search | Pulls direct contact details using name + verified domain. |
| **4. Deliverability Guard** | Verify catch-alls, disposable domains, and MX records. | `email-verifier` (`agent/services/email_verifier.py`) | Protects domain reputation by ensuring 100% email validity. |
| **5. Scoring & Copy Gen** | Synthesize insights, calculate 0–100 ICP fit score, draft copy. | OpenRouter LLM (Structured JSON Schema) | Generates tailored observations and quote breakdowns rather than generic templates. |
| **6. Dispatch / Closing** | Send cold hook sequence or quote link, update CRM. | Gmail API (`gmail_adapter.py`) & PostgreSQL | Delivers the campaign and logs verified leads in the CRM database. |

---

## 3. Key Technical Innovations & Tools

### A. Apollo API Integration & Key Management (`agent/tool_gateway/apollo_mcp.py`)
- Provides MCP tools `apollo_search_accounts` and `apollo_find_contacts`.
- Enables tenant-specific Apollo Master API Key entry via the frontend UI modal.
- Resolves keys per tenant from the `tenant_apollo_settings` database table.

### B. Deliverability Guard (`agent/services/email_verifier.py`)
- Inspired by `https://github.com/AfterShip/email-verifier`.
- Features:
  - **Syntax Validation**: RFC-5322 regex validation.
  - **MX DNS Record Verification**: Asynchronous DNS MX record lookup.
  - **Disposable Domain Filtering**: Rejects temporary email services (Mailinator, TempMail, YopMail).
  - **Free Webmail Identification**: Identifies generic vs custom enterprise domains.

### C. Crawl4AI Web Research (`agent/graph/sales/nodes/account_fit_research.py`)
- Scrapes candidate website content using headless browser extraction.
- Extracts markdown structured text for business model and pain point analysis.

### D. OpenRouter LLM Copy & Fit Scoring (`agent/graph/sales/nodes/scoring_copy_gen.py`)
- Generates structured JSON schema containing:
  - `icp_score`: Numerical score (0–100).
  - `outreach_subject`: Personalized email subject line.
  - `outreach_body`: Contextual cold hook body.
  - `quote_summary`: Tier and price breakdown.

### E. Gmail API Outreach (`agent/graph/sales/nodes/dispatch_closing.py`)
- Connects to `gmail_adapter.py` to dispatch cold emails directly from tenant Gmail accounts.

---

## 4. Database Schema (`backend/database/migrations/023_ai_sdr_sales_agent_schema.sql`)

1. **`tenant_apollo_settings`**: Secure store for tenant Apollo API Keys.
2. **`sales_icp_configs`**: ICP criteria, target industries, target role titles, battlecards, and playbooks.
3. **`sales_prospects`**: Discovered leads, verified emails, deliverability badges, ICP fit scores, scraped text, generated copy, and deal stages.
4. **`sales_pipeline_logs`**: Step-by-step execution audit trail per SDR run.

---

## 5. API Reference

### Agent Gateway (FastAPI `:8000`)
- `POST /agent/sales/run` — Executes 6-stage AI SDR pipeline.
- `POST /agent/sales/apollo-key` — Saves Apollo Master API key for tenant.
- `GET /agent/sales/apollo-key/{tenant_id}` — Checks Apollo API key configuration status.
- `POST /agent/sales/icp` — Updates tenant ICP parameters.
- `GET /agent/sales/icp/{tenant_id}` — Retrieves tenant ICP configuration.

### Backend API (Express `:4000`)
- `GET /api/v1/sales/prospects` — Fetches discovered CRM prospects.
- `POST /api/v1/sales/pipeline/run` — Triggers autonomous SDR run.
- `POST /api/v1/sales/apollo-key` — Sets Apollo API Key.
- `GET /api/v1/sales/apollo-key` — Fetches Apollo Key status.
- `POST /api/v1/sales/icp` — Saves ICP criteria.
- `GET /api/v1/sales/icp` — Fetches ICP criteria.

---

## 6. User Guide & Operational Workflow

1. **Configure Apollo Master API Key**: Click **"Configure Apollo API Key"** in the UI header and paste your key.
2. **Set Up ICP Strategy**: Click **"ICP Strategy Setup"** to define target industries, role titles, battlecards, and sales playbooks.
3. **Run Autonomous SDR Campaign**: Enter an optional target domain or leave empty for auto-sourcing, then click **"Run SDR Lead Campaign"**.
4. **Review Prospects & Deals**: View enriched contacts, deliverability badges, 0–100 ICP fit scores, and generated outreach emails in the **CRM Lead Pipeline** table.
