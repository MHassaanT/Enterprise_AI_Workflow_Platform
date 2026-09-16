# Enterprise AI Workforce Platform

**A fully multi-tenant, agentic SaaS platform that automates cross-functional business operations using specialized AI agents, RAG pipelines, and human-in-the-loop approval workflows.**

Built solo over 47 days as part of an AI/ML Engineering Internship at **DigitalSofts, Faisalabad**.

---

## What It Does

Instead of hiring separate teams for Sales, HR, Finance, and Procurement — businesses connect once, provide their context, and a workforce of AI agents handles operations autonomously. Every sensitive action passes through a human approval checkpoint before execution.

---

## 7 Specialized AI Agents

| Agent | What It Does |
|---|---|
| **Customer Support** | RAG-powered conversational agent — answers customer queries from uploaded company documents with inline citations and human escalation for high-risk actions |
| **Sales SDR** | Autonomous lead discovery via web crawling, email verification (Hunter.io), personalized outreach copy generation, and WhatsApp campaign dispatch |
| **HR & People Ops** | Employee onboarding automation, attendance tracking, leave processing, recruitment pipeline, and policy Q&A |
| **Finance & Ledger** | Departmental budget management, spend tracking, revenue monitoring, and cross-agent ledger sync |
| **Procurement** | Vendor research, RFQ/RFP generation, vendor scoring matrices, and contract tracking |
| **Coding & Repositories** | GitHub integration, structural code parsing, code analysis, and automated PR proposals |
| **Executive Analytics** | Real-time cross-departmental aggregation of HR, Finance, and Project metrics for executive decision-making |

---

## Core Platform Capabilities

**Multi-Tenancy & Row-Level Security**
Strict data isolation enforced natively in PostgreSQL via session-scoped RLS policies. Every tenant's data is completely isolated at the database layer — not just the application layer.

**RAG Pipeline**
PDF/DOCX text extraction → content-aware semantic chunking → Google Gemini Embedding-001 vectorization → Qdrant tenant-filtered similarity search → grounded LLM response with inline citations.

**FastMCP Tool Gateway**
Model Context Protocol (FastMCP) integration enabling dynamic tool binding with Pydantic validation and a three-stage execution safety gate before any real-world action fires.

**Human-in-the-Loop Approvals**
High-risk actions (refunds, payments, budget updates, human escalation) are intercepted, queued in PostgreSQL, and require explicit reviewer approval before the agent proceeds.

**Visual Workflow Builder**
React Flow node-based canvas for constructing, editing, and executing custom multi-step agent workflows without writing code.

**Subscription & Billing**
Full subscription system with SafePay (Pakistani payment gateway) integration and plan-based feature gating.

**WhatsApp MCP Channel**
Real-time WhatsApp integration via Baileys allowing agents to send and receive messages directly through the platform.

---

## Tech Stack

| Layer | Technologies |
|---|---|
| **Frontend** | Next.js 16 (App Router), React 19, Tailwind CSS, React Flow (`@xyflow/react`), Lucide Icons |
| **API Gateway** | Node.js, Express, JWT Authentication, Bcrypt, RBAC Middleware, `pg` (RLS-aware PostgreSQL client) |
| **Agent Orchestration** | Python 3.11, FastAPI, LangGraph, LangChain, FastMCP, Pydantic v2, AsyncPG |
| **AI & RAG** | Google Gemini 2.5 Flash, Gemini Embedding-001, OpenRouter, Ollama, Crawl4AI, Playwright |
| **Databases** | PostgreSQL 15 (RLS), Qdrant Vector DB, Redis 7 |
| **Integrations** | GitHub, Gmail, Google Docs, Google Sheets, HubSpot, Airtable, ClickUp, Stripe, SafePay, Supabase, Vercel, Resend, WhatsApp |
| **Infrastructure** | Docker, Docker Compose, Uvicorn |

---

## Scale

```
47 days of development
7  specialized AI agents
13 external tool integrations (MCP adapters)
45 database migrations
30+ frontend pages and views
25 technical engineering reports
 1 developer
```

---

## Architecture

```
Next.js Frontend :3000
        │ JWT Auth / REST
        ▼
Node.js API Gateway :4000
        │                    │
        ▼                    ▼
PostgreSQL :5432      Python FastAPI Agent :8000
Qdrant :6333                 │
Redis :6379           LangGraph Engine
                             │
                      FastMCP Tool Server
                             │
              GitHub · Gmail · WhatsApp · SafePay · ...
```

---

## Security Model

- **Row-Level Security:** PostgreSQL enforces tenant isolation at the query level via `SET app.tenant_id`. No application-layer filtering can accidentally leak cross-tenant data.
- **Inter-Service Token:** Node ↔ Python communication requires a shared `X-Internal-Token` header. Internal endpoints reject all unauthorized callers.
- **Three-Stage Tool Gate:** Every tool execution passes an allowlist check, Pydantic schema validation, and pre-execution audit logging before firing.
- **RBAC:** Three roles — Admin, Employee, Reviewer — enforced at route middleware level.

---

## Documentation

Full engineering reports available in `/docs`:

- Architecture Overview
- Sales SDR Agent — Deliverability & Pipeline Report
- HR Agent — Workflow & Polling Architecture
- Finance Agent — Implementation Report
- Procurement Agent — Implementation Report
- Analytics Agent — Scope & Capability Report
- Coding Agent — Cross-Agent Issue Escalation Report
- Workflow Builder — Critical Issues & Resolution Report
- WhatsApp MCP Channel — Implementation Report
- SafePay Subscription — Migration & Onboarding Report
- And 15 more...

---

## Built By

**Hassan Tahir** — AI Product Builder & SaaS Founder
[portfolio.zarea.site](https://portfolio.zarea.site) · [linkedin.com/in/hassaan-tahir-zarea](https://linkedin.com/in/hassaan-tahir-zarea) · [github.com/MHassaanT](https://github.com/MHassaanT)

*AI/ML Engineering Intern @ DigitalSofts, Faisalabad, Pakistan*
