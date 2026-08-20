# Hunter.io MCP Connection & Tool Gateway Integration Report

## Executive Summary

This document details the architectural design, security model, API specifications, and implementation details for integrating **Hunter.io** as a first-class Model Context Protocol (MCP) provider within the Enterprise AI Workflow Platform.

Hunter.io empowers autonomous agents (such as the AI Sales SDR Agent) with lead discovery, company/person enrichment, domain email search, decision-maker lookup, and deliverability verification capabilities across **7 core Hunter.io API v2 endpoints**.

---

## Architecture Overview

The integration adheres to the platform's multi-tenant, zero-trust Model Context Protocol architecture:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Frontend Integration Hub                          │
│                (/mcp - UI Card Grid, Credential Modals, Tool Allowlist)      │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ REST / JSON
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Backend Express Services                          │
│       (mcp_gateway.js - Tool Registry, AES-256-GCM Credential Encryption)   │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ Postgres DB (tool_registry, tool_credentials)
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Python Centralized Gateway                        │
│   (centralized_gateway.py, registry.py - Security Allowlist & HITL Checks)  │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ Vendor Adapters
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       Hunter.io Python Adapter                              │
│  (hunter_adapter.py - HTTP V2 REST API + Async Client + Sandbox Fallback)   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Supported Hunter.io API v2 Endpoints

The implementation provides full support for all 7 primary Hunter.io REST V2 API endpoints plus account quota monitoring:

| # | Feature | HTTP Method & Path | Canonical Tool Name | Primary Parameters | Description |
|---|---------|-------------------|--------------------|-------------------|-------------|
| 1 | **Discover Leads** | `POST /v2/discover` | `hunter_discover` | `query` object, `limit` | Discovers target lead profiles across industries, companies, and locations. |
| 2 | **Domain Search** | `GET /v2/domain-search` | `hunter_domain_search` | `domain`, `limit`, `type` | Retrieves verified emails and pattern structures for a target domain. |
| 3 | **Email Finder** | `GET /v2/email-finder` | `hunter_email_finder` | `domain`, `first_name`, `last_name` | Finds the specific email address of a named executive at a target company. |
| 4 | **Email Verification** | `GET /v2/email-verifier` | `hunter_verify_email` | `email` | Runs multi-check deliverability verification (score 0–100, MX, SMTP, disposable filter). |
| 5 | **Company Enrichment** | `GET /v2/companies/find` | `hunter_company_enrichment` | `domain` | Enriches company firmographics, employee count, location, and tech stack. |
| 6 | **Person Enrichment** | `GET /v2/people/find` | `hunter_person_enrichment` | `email` | Enriches executive profiles, job title, social profiles, and bio. |
| 7 | **Combined Enrichment** | `GET /v2/combined/find` | `hunter_combined_enrichment` | `email` | Fetches combined person + company profiles in a single API call. |
| 8 | **Account Info** | `GET /v2/account` | `hunter_account_info` | *None* | Queries account credit usage, search quotas, and active plan name. |

---

## Component Implementation Details

### 1. Database Migration (`024_seed_hunter_io_mcp.sql`)
Location: `backend/database/migrations/024_seed_hunter_io_mcp.sql`

Seeds 9 canonical records into `tool_registry`:
- Main Integration Hub entry: `Hunter.io`
- 8 Tool entries: `hunter_discover`, `hunter_domain_search`, `hunter_email_finder`, `hunter_verify_email`, `hunter_company_enrichment`, `hunter_person_enrichment`, `hunter_combined_enrichment`, and `hunter_account_info`.

### 2. Hunter.io Python Adapter (`hunter_adapter.py`)
Location: `agent/tool_gateway/adapters/hunter_adapter.py`

- Built using `httpx.AsyncClient` with a 15-second timeout limit.
- Dynamically resolves tenant credentials (`api_key`).
- Implements `_execute_sandbox_fallback(...)` to allow agents and developers to test workflows even before entering a live API key.

### 3. Centralized Tool Router & Dynamic Schema Generator
Locations: `agent/tool_gateway/centralized_gateway.py` & `agent/tool_gateway/registry.py`

- **Router**: Directs tool calls where `provider_type == "hunter"` or `"hunter"` is present in the requested tool name to `execute_hunter_tool`.
- **Dynamic Schema**: Generates `HunterDynamicInput` Pydantic models containing typed fields (`action`, `domain`, `email`, `first_name`, `last_name`, `company`, `query`, `limit`) so LLMs understand tool input syntax.

### 4. Sales SDR Deliverability Guard Integration
Location: `agent/services/email_verifier.py`

- Added `verify_email_with_hunter(email, tenant_id)` helper function.
- Integrates Hunter's deliverability verification output directly into the SDR outreach pipeline to prevent hard bounces before cold email generation.

### 5. Frontend Integration Hub UI
Location: `frontend/src/app/mcp/page.js`

- Added **Hunter.io Email Intelligence** card (`#ff6b4a` to `#d9381e` gradient badge).
- Added an encrypted API key modal dialog with zero-trust AES-256-GCM payload handling.
- Added `Hunter.io` to the per-agent tool binder dropdown.

---

## Security & Risk Policy Assessment

1. **Zero-Trust Encryption**: All API keys submitted through the Integration Hub UI are encrypted using **AES-256-GCM** before persistence in `tool_credentials` and scoped by `tenant_id`.
2. **Tenant & Agent Isolation**: Agents can only execute Hunter.io tools if an admin explicitly binds the tool to the specific `agent_instance_id` in `tool_bindings`.
3. **Risk Level & HITL Policies**: Read/Enrichment tools (`hunter_domain_search`, `hunter_verify_email`, etc.) default to `is_high_risk = false`. High-credit bulk actions can be configured for Human-in-the-Loop (HITL) approval via the `/mcp` control panel.

---

## Verification & Testing Log

All 7 endpoints were executed against the Python test suite in the project environment:

```text
=== 1. Discover (POST /v2/discover) ===
Endpoint: POST /v2/discover | Status: success

=== 2. Domain Search (GET /v2/domain-search) ===
Endpoint: GET /v2/domain-search | Status: success

=== 3. Email Finder (GET /v2/email-finder) ===
Endpoint: GET /v2/email-finder | Status: success

=== 4. Email Verification (GET /v2/email-verifier) ===
Endpoint: GET /v2/email-verifier | Status: success

=== 5. Company Enrichment (GET /v2/companies/find) ===
Endpoint: GET /v2/companies/find | Status: success

=== 6. Person Enrichment (GET /v2/people/find) ===
Endpoint: GET /v2/people/find | Status: success

=== 7. Combined Enrichment (GET /v2/combined/find) ===
Endpoint: GET /v2/combined/find | Status: success
```

---

## Usage Guide

### Connecting via Integration Hub
1. Navigate to `/mcp` in the platform dashboard.
2. Click **Connect** on the **Hunter.io Email Intelligence** integration card.
3. Input your Hunter.io API Key (`v2_live_...`) and click **Save Credentials**.
4. In the **Bind Integration Tool to Agent** section, select your target Agent Instance, choose **Hunter.io** as the connector type, select the desired tools, and save the binding.

### LLM Agent Prompt Example
```text
"Use Hunter Domain Search to find decision-maker contact emails for stripe.com, then run Hunter Email Verifier on the top result before composing outreach."
```
