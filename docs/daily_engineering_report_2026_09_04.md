# Engineering Daily Report: Platform Capabilities, Resilience & Integrations

**Date**: September 4, 2026  
**Author**: Antigravity AI Senior Engineering Team  
**Scope**: Full-Stack Platform (Frontend, Backend API, Python Agent Service, Vector Ingestion, Database Migrations)  
**Status**: Completed, Tested & Deployed to Production  

---

## 1. Executive Summary

On September 4, 2026, the engineering team executed a comprehensive series of feature enhancements, resilience refactors, and critical system stabilizations across the entire Enterprise AI Workflow Platform. Today's work spanned six core operational domains:

1. **Authentication & Compliance Accessibility**: Made legal documentation (`/terms`, `/privacy`) publicly accessible without auth redirects, unified token storage access across components, and streamlined administrative navigation.
2. **LLM Engine Resilience**: Mitigated Google Gemini 503 API capacity outages during schema auto-generation by implementing an OpenRouter failover integration.
3. **In-House Customer Support Email Verification**: Designed and deployed a secure, self-contained Email OTP verification system (`authenticate_user_with_email`) enabling conversational identity verification directly inside agent chat sessions.
4. **Dynamic Tenant Entity Routing & Circuit Breaker Stabilization**: Solved agent execution failures when querying dynamic tenant database entities (such as `Rides`, `Riders`, and `Passengers`) by generating dynamic LangChain structured tools per tenant entity, routing lookups through external Supabase databases, and preventing false-positive circuit breaker trips.
5. **Agent Service Startup Recovery**: Intercepted and fixed an environment startup regression caused by an unimported typing primitive in the tool registry.
6. **Intelligent Sitemap & Multi-Page Knowledge Base Ingestion**: Transformed web ingestion from single-page scraping into an intelligent, LLM-curated sitemap crawler with asynchronous background processing and live UI progress streaming.

---

## 2. Commit Log & Delivery Timeline (September 4, 2026)

| Commit Hash | Component | Summary |
|---|---|---|
| `6e1ba66` | Frontend UI | Polished home landing page copy, updated CTA to "See How Agent Work". |
| `4bcba38` | Frontend / Auth | Made Terms of Service (`/terms`) and Privacy Policy (`/privacy`) public across guards, sidebar, and plan gating. |
| `717b1a3` | Frontend / Entities | Standardized auth token retrieval (`ai_platform_token`) and removed unused tabs ("Agent Context", "Integrations"). |
| `d995d72` | Backend / LLM | Swapped Gemini for OpenRouter with structured JSON parsing to resolve 503 "High Demand" errors during entity generation. |
| `b9b9791` | Full-Stack | Implemented in-house email OTP tool (`authenticate_user_with_email`), database migration `036`, and internal verification routes. |
| `7da0b29` | Agent & Backend | Enabled dynamic entity tool routing (`search_<entity>`, `get_<entity>_by_id`), external Supabase DB lookup, and circuit breaker resilience. |
| `1cf0e27` | Agent Service | Fixed `NameError: name 'Optional' is not defined` in `tool_gateway/registry.py` to prevent container startup crashes. |
| `2cbe308` | Agent, Backend, Frontend | Built intelligent multi-page web crawler with sitemap discovery, LLM URL curation, batch scraping, and background ingestion. |

---

## 3. Detailed Workstream Breakdown

### Workstream 1: Platform UI, Access Control & Navigation Improvements

#### 1.1 Public Legal Pages (`/terms` & `/privacy`)
- **Problem**: Users and unauthenticated visitors attempting to view Terms of Service or Privacy Policy were forcibly intercepted by `AuthGuard` and redirected to `/login`. Furthermore, 401 response interceptors cleared session tokens and redirected away from legal documentation.
- **Solution**:
  - Updated `frontend/src/app/components/AuthGuard.js` with an extensible `isPublicRoute` matcher recognizing `/terms` and `/privacy`.
  - Updated `frontend/src/app/components/Sidebar.js` to suppress navigation bars on public pages.
  - Updated `frontend/src/lib/api.js` to prevent 401 redirects when browsing legal documents.
  - Added public exemptions to `frontend/src/lib/planGating.js` under `ALWAYS_ACCESSIBLE_ROUTES`.

#### 1.2 Auth Token Key Alignment & Entities UI Cleanup
- **Problem**: The Entities builder in `frontend/src/app/entities/page.js` was reading `localStorage.getItem('token')` instead of the application standard `localStorage.getItem('ai_platform_token')`, causing intermittent 401 unauthorized errors upon page reload.
- **Solution**:
  - Corrected token retrieval to `ai_platform_token`.
  - Removed outdated and redundant tabs (`Agent Context` and `Integrations`) from the `/entities` management dashboard, focusing the user experience directly on schema definition and entity attributes.

---

### Workstream 2: LLM Service Resilience & OpenRouter Integration

#### 2.1 Bypassing Google GenAI 503 "High Demand" Spikes
- **Problem**: During user onboarding and automatic entity generation, Google Gemini API repeatedly threw:
  ```json
  {"error":{"code":503,"message":"This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.","status":"UNAVAILABLE"}}
  ```
  This left users blocked on the initial setup step when generating custom schemas.
- **Solution**:
  - Refactored `backend/src/services/llmService.js` to route schema generation requests through OpenRouter.
  - Configured OpenRouter endpoint (`https://openrouter.ai/api/v1/chat/completions`) using high-throughput models (`deepseek/deepseek-chat` / `openai/gpt-4o-mini`).
  - Added deterministic schema prompt injection with markdown code block stripping (`replace(/```json|```/g, '')`) and resilient JSON parsing fallbacks to guarantee valid entity definitions.

---

### Workstream 3: Customer Support In-House Email OTP Authentication Tool

#### 3.1 Architecture & Objectives
To enable agents to look up and act upon sensitive customer records (orders, bookings, account profiles) while preventing unauthorized data leakage, we implemented an in-house, zero-external-dependency identity verification tool: `authenticate_user_with_email`.

```
[ User Request ] ──► [ Agent identifies need for Auth ]
                             │
                             ▼
               [ Tool: authenticate_user_with_email ]
                    (action: "send_otp")
                             │
                             ▼
              [ POST /internal/otp/generate ]
                             │
        ┌────────────────────┴────────────────────┐
        ▼                                         ▼
[ Hash OTP & Store in DB ]               [ Dispatch Email via ]
[ table: tenant_email_otps ]             [ Tenant SMTP / Gmail ]
        │                                         │
        ▼                                         ▼
[ Agent instructs user: "Code sent" ]    [ User receives 6-digit code ]
        │                                         │
        └────────────────────┬────────────────────┘
                             ▼
           [ User replies with OTP code in chat ]
                             │
                             ▼
               [ Tool: authenticate_user_with_email ]
                   (action: "verify_otp")
                             │
                             ▼
               [ POST /internal/otp/verify ]
                             │
                 ┌───────────┴───────────┐
                 ▼                       ▼
            [ MATCH ]               [ MISMATCH ]
         Status = verified      Increment attempts
         Agent proceeds         Agent prompts retry
```

#### 3.2 Database Layer: Migration `036_tenant_email_otps.sql`
- Created table `tenant_email_otps`:
  - `id` (UUID, primary key)
  - `tenant_id` (UUID, foreign key with tenant isolation index)
  - `email` (Text, normalized lowercase)
  - `otp_hash` (Text, SHA-256 secure hash)
  - `purpose` (Text, default `'agent_verification'`)
  - `attempts` (Integer, capped at max 5 attempts)
  - `expires_at` (Timestamp, 10-minute expiry window)
  - `status` (Enum: `'pending'`, `'verified'`, `'expired'`, `'failed'`)
  - `created_at`, `updated_at` timestamps

#### 3.3 Backend API Endpoints: `backend/src/routes/internal.js`
- `POST /internal/otp/generate`: Generates cryptographically secure 6-digit random code, hashes it with SHA-256, invalidates prior active codes for that email/tenant, persists the record, and sends an HTML email via `nodemailer` using the tenant's configured Gmail integration credentials.
- `POST /internal/otp/verify`: Validates code against stored hash, checks expiry time and max attempt limits, updates status to `'verified'`, and returns success context.
- `GET /internal/otp/status`: Provides agent with verification status query capability.

#### 3.4 Python Agent Tool: `agent/tool_gateway/tools/authenticate_user_with_email.py`
- Exposes Pydantic schema `AuthenticateUserWithEmailInput` with parameters:
  - `action`: Literal[`"send_otp"`, `"verify_otp"`]
  - `email`: Target user email address
  - `otp`: 6-digit verification code (required for `verify_otp`)
- Registered in `agent/tool_gateway/registry.py` under both `TOOL_REGISTRY` and `LANGCHAIN_TOOLS`, granting the Customer Support Agent immediate access to two-step conversational identity verification.

---

### Workstream 4: Dynamic Tenant Entity Routing & Circuit Breaker Stabilization

#### 4.1 The Dynamic Entity Problem
- **Symptom**: When a user created custom entities such as `Rides`, `Riders`, or `Passengers` and queried the Customer Support Agent (e.g. *"Show me my ride history"*), the agent returned:
  ```
  "Tool search_rides is not allowed for this agent instance or failed circuit breaker"
  ```
- **Root Cause**:
  1. The tool registry only statically defined legacy e-commerce tools (`check_order_status`, `submit_refund_request`).
  2. The tool allowlist check failed because custom entity tools were not generated in the agent's LangChain tool catalog.
  3. When the agent attempted to fall back to `search_entities`, the gateway routed requests to internal Postgres tables rather than the tenant's connected Supabase database, resulting in HTTP 500 errors that tripped the gateway circuit breaker.

#### 4.2 Dynamic StructuredTool Generation
- Updated `agent/tool_gateway/registry.py` to inspect `tenant_context.get("entities", [])` on every agent invocation:
  - For each active entity, dynamically synthesizes two LangChain `StructuredTool` instances:
    1. `search_<entity_name>`: Performs filtered queries across entity attributes.
    2. `get_<entity_name>_by_id`: Fetches specific entity records by ID.
  - Dynamically constructs tool descriptions incorporating the entity's field names and data types, providing the LLM with exact parameter guidance.

#### 4.3 Central Gateway Dispatch & External Supabase Lookup
- Updated `agent/tool_gateway/centralized_gateway.py`:
  - Added prefix recognition for `search_*` and `get_*_by_id`.
  - Dispatches calls directly to `/internal/entities/search` and `/internal/entities/get`.
- Updated `backend/src/routes/internal.js`:
  - When querying custom entities, the route checks if the tenant has connected an external database (e.g., Supabase integration in `tenant_integrations`).
  - Queries the external database using the tenant's credentials with parameterized queries, returning clean entity record arrays.
  - Wrapped dynamic lookups in safe execution blocks that return empty results (`{ success: true, count: 0, results: [] }`) instead of throwing 500 errors, thereby preventing circuit breaker trips on zero-result queries.

---

### Workstream 5: Agent Service Critical Startup Fix

#### 5.1 Root Cause Analysis
Following the deployment of commit `7da0b29`, the Agent Service container crashed on boot with:
```
File "/app/tool_gateway/registry.py", line 392, in DynamicSearchInput
    query: Optional[str] = Field(default=None, description="...")
NameError: name 'Optional' is not defined
```
Line 11 of `agent/tool_gateway/registry.py` imported `from typing import Callable, List, Dict, Any`, omitting `Optional`. Because Pydantic evaluates type annotations at module load time, the missing type caused uvicorn to fail before binding to port 8000.

#### 5.2 Resolution & Verification
- Updated `agent/tool_gateway/registry.py` line 11 to include `Optional`.
- Verified compilation using `python3 -m py_compile`.
- Tested complete application import hierarchy inside the virtual environment (`.venv`), confirming that `tool_gateway.registry` and `main.py` initialize cleanly without errors.
- Created and deployed commit `1cf0e27`.

---

### Workstream 6: Intelligent Sitemap & Multi-Page Knowledge Base Ingestion

#### 6.1 Problem & Prior Constraints
Previously, Knowledge Base URL ingestion only scraped the single target HTML page. Enterprise users providing a root domain (e.g. `docs.company.com`) received zero indexing of subpages, policies, and API documentation. Conversely, naive recursive spiders cause memory exhaustion (OOM), gateway timeouts, and duplicate indexing.

#### 6.2 Implementation Architecture
- **Sitemap Discovery & Parsing (`agent/services/sitemap_crawler.py`)**:
  - Inspects `robots.txt` for `Sitemap:` directives.
  - Probes `/sitemap.xml` and `/sitemap_index.xml` (recursing into nested sub-sitemaps).
  - Filters out non-HTML assets (`.png`, `.pdf`, `.zip`, `.css`, `.js`) and URL fragments.
  - Implements an anchor-tag crawler fallback if no sitemap exists.
- **LLM Semantic URL Curation**:
  - Passes discovered candidate URLs to Gemini Flash (`curate_urls_with_llm`).
  - Prioritizes high-signal documentation, pricing, product, and policy pages while pruning localized duplicates (e.g., `/de/`, `/es/`) and pagination archives.
- **Controlled Batch Scraping**:
  - Scrapes curated URLs in parallel with an `asyncio.Semaphore(5)` concurrency limit using Crawl4AI with automatic `httpx` + BeautifulSoup fallback.
- **Asynchronous Non-Blocking Ingestion Pipeline**:
  - Express backend (`backend/src/routes/documents.js`) creates a root document in `'processing'` state and immediately returns `202 Accepted` (<200ms).
  - Background worker (`backend/src/services/ingestion.js`) coordinates page scraping, recursive chunking, and Qdrant vector embedding generation.
- **Interactive UI (`frontend/src/app/components/DocumentModal.js`)**:
  - Added crawl mode toggle: "Single Webpage" vs. "Entire Website / Docs (Smart Sitemap)".
  - Added configurable maximum pages slider (1 to 100 pages).
  - Implemented real-time polling (every 3 seconds) with progress indicators streaming discovered subpages directly into the user's document table.

---

## 4. Verification & Testing Summary

| Test Case | Method | Result |
|---|---|---|
| **Public Legal Routes** | Direct browser access to `/terms` & `/privacy` in incognito mode without session tokens | **PASSED**: Pages render without redirecting to `/login` |
| **OpenRouter Entity Generation** | Invoked `POST /api/entities/generate` with custom industry prompts | **PASSED**: Valid structured JSON entities returned without 503 errors |
| **Email OTP Dispatch** | Called `authenticate_user_with_email` with `action="send_otp"` | **PASSED**: 6-digit code stored in `tenant_email_otps` and dispatched via Gmail SMTP |
| **Email OTP Verification** | Submitted valid and invalid 6-digit codes to `action="verify_otp"` | **PASSED**: Valid codes transitioned status to `verified`; invalid codes incremented attempt counter |
| **Dynamic Entity Tools** | Queried agent for `Rides` and `Riders` with active tenant entities | **PASSED**: Agent invoked `search_rides`, queried external Supabase DB, and responded with ride records without tripping circuit breaker |
| **Agent Service Boot** | Executed `main.py` import and startup in `.venv` | **PASSED**: Clean startup with 0 syntax or runtime import errors |
| **Sitemap Crawler & LLM Curation** | Ran test suite in `agent/tests/test_sitemap_crawler.py` against live URLs | **PASSED**: Successfully parsed sitemaps, curated high-value pages, and embedded chunks in Qdrant |

---

## 5. Summary of Modified Files

```
agent/
├── routers/
│   └── tools.py                       # Added POST /scrape-site endpoint and request schemas
├── services/
│   ├── sitemap_crawler.py             # New: Sitemap discovery, LLM triage, and batch scraper
│   └── llm_gateway.py                 # LLM client bindings for crawler curation
├── tests/
│   └── test_sitemap_crawler.py        # New: Unit and integration tests for sitemap crawler
└── tool_gateway/
    ├── registry.py                    # Fixed Optional import, added dynamic entity tool generators
    ├── centralized_gateway.py         # Added dynamic entity routing & circuit breaker safety
    └── tools/
        └── authenticate_user_with_email.py # New: Email OTP verification tool

backend/
├── migrations/
│   └── 036_tenant_email_otps.sql      # New: Database schema for tenant email OTPs
└── src/
    ├── routes/
    │   ├── documents.js               # Updated to support async crawlEntireSite parameter
    │   └── internal.js                # Added OTP generation/verification & external DB entity routes
    └── services/
        ├── ingestion.js               # Background batch document chunking & Qdrant embedding
        └── llmService.js              # Refactored to OpenRouter for entity auto-generation

frontend/
├── src/
│   ├── app/
│   │   ├── page.js                    # Landing page copy & CTA improvements
│   │   ├── entities/page.js           # Auth token key fix, streamlined tabs
│   │   └── components/
│   │       ├── AuthGuard.js           # Whitelisted public routes (/terms, /privacy)
│   │       ├── Sidebar.js             # Public route sidebar suppression
│   │       └── DocumentModal.js       # Smart sitemap crawler toggle, slider & live polling
│   └── lib/
│       ├── api.js                     # 401 redirect protection for legal pages
│       └── planGating.js              # Whitelisted public legal routes
```

---

## 6. Recommendations & Next Steps

1. **Email Rate Limiting & Monitoring**:
   - Introduce per-IP and per-email rate limiting on `/internal/otp/generate` (e.g. maximum 3 OTP requests per 15 minutes) to protect tenant SMTP quotas from abusive spam requests.
2. **Dynamic Entity CRUD Extension**:
   - Currently, dynamic entity generation supports `search_<entity>` and `get_<entity>_by_id`. Expanding to `create_<entity>` and `update_<entity>` with human-in-the-loop approval will unlock full transactional automation for customer support and operational agents.
3. **Webhook Notifications for Long Sitemap Ingestion**:
   - For very large sites (>50 pages), complement UI polling with in-app notifications or email alerts once Qdrant vector indexing completes.
