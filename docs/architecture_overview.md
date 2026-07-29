# Enterprise AI Workflow Platform — Architecture & Design Overview

> **Last updated:** 2026-07-29  
> **Status:** Phase 3 (Agent Orchestration)

---

## 1. Executive Summary

The **Enterprise AI Workflow Platform** is a multi-tenant, RAG-powered customer support system built across three independent services:

| Layer | Technology | Port |
|---|---|---|
| **Frontend** | *(not yet implemented)* | — |
| **API Gateway (Backend)** | Node.js / Express | `4000` |
| **Agent Orchestration** | Python / FastAPI + LangGraph | `8000` |

Supporting infrastructure (all via Docker Compose):

| Service | Image | Port |
|---|---|---|
| **PostgreSQL** | `postgres:15` | `5432` |
| **Qdrant** | `qdrant/qdrant:latest` | `6333` |
| **Redis** | `redis:7-alpine` | `6379` |

---

## 2. High-Level Architecture

```
[Client / Browser]
       │
       ▼  JWT Bearer token
┌──────────────────────────┐
│  Node.js API Gateway     │  :4000
│  Express + Helmet + CORS │
│                          │
│  /api/auth               │──► PostgreSQL (users, tenants)
│  /api/conversations      │──► PostgreSQL + Agent Service
│  /api/documents          │──► PostgreSQL + Qdrant
│  /internal  (token-guarded)│◄── Agent Service (internal calls)
└──────────┬───────────────┘
           │ X-Internal-Token  (POST /agent/run)
           ▼
┌──────────────────────────────────────────────────────────┐
│  Python Agent Orchestration Service        :8000          │
│  FastAPI + LangGraph + FastMCP                            │
│                                                           │
│  POST /agent/run ──► LangGraph StateGraph                 │
│  GET  /health                                             │
│  /mcp  (Streamable HTTP — FastMCP tool surface)           │
└──────────────────────────────────────────────────────────┘
           │
           │ httpx (internal calls back to :4000)
           ├──► POST /internal/rag/query
           ├──► POST /internal/approvals
           └──► POST /internal/audit
```

---

## 3. Service 1 — Node.js API Gateway

### 3.1 Entry Point

**`backend/src/index.js`** — Express app setup:
- `helmet()` for HTTP security headers
- `cors()` for cross-origin control
- `express-async-errors` for async error propagation

### 3.2 Route Map

| Route Prefix | File | Description |
|---|---|---|
| `POST /api/auth/register` | `routes/auth.js` | Create tenant + admin user |
| `POST /api/auth/login` | `routes/auth.js` | Returns JWT |
| `GET/POST /api/conversations` | `routes/conversations.js` | CRUD conversations |
| `POST /api/conversations/:id/messages` | `routes/conversations.js` | Send message → agent |
| `GET/PATCH /api/conversations/approvals/*` | `routes/conversations.js` | Approval workflow |
| `POST /api/documents` | `routes/documents.js` | Upload PDF/DOCX |
| `GET/DELETE /api/documents/:id` | `routes/documents.js` | Document management |
| `/internal/*` | `routes/internal.js` | Agent-only, token-guarded |

### 3.3 Middleware Chain

```
Request
  └─► authenticate()   — validates JWT, injects req.user = {id, tenantId, role, email}
        └─► authorize(...roles) — RBAC check against role enum: admin | employee | reviewer
```

**`middleware/auth.js`** — `jwt.verify()` → decodes `{userId, tenantId, role, email}` into `req.user`.

**`middleware/rbac.js`** — factory returning role-check middleware; returns `403` if role not in allowlist.

### 3.4 Agent Proxy (Message Send Flow)

When `POST /api/conversations/:id/messages` is called:

1. Save the user message to `messages` table.
2. Resolve `agent_instance_id` from the conversation.
3. **If agent-backed:** call `callAgentService()` — raw `http`/`https` POST to `:8000/agent/run` with `X-Internal-Token`.
4. **If no agent:** fall back to direct `answerWithRAG()`.
5. Persist the assistant reply (with `citations_json`) to `messages`.
6. Return `{ userMessage, agentMessage, citations, approvalPending, approvalId }`.

### 3.5 Internal Routes (`/internal`)

Protected by a shared-secret middleware (`X-Internal-Token` header). Only the Python agent calls these.

| Endpoint | Purpose |
|---|---|
| `POST /internal/rag/query` | Run vector search + generate answer via RAG, return raw chunks + citations |
| `POST /internal/approvals` | Insert `approval_requests` row, return new UUID |
| `POST /internal/audit` | Append row to `audit_logs` |

---

## 4. Service 2 — Python Agent Orchestration

### 4.1 Entry Point

**`agent/main.py`** — FastAPI app:
- Mounts **FastMCP** at `/mcp` (Streamable HTTP transport).
- Registers `/agent` router.
- CORS restricted to `http://localhost:4000` only.
- MCP lifespan passed to FastAPI for session management.

### 4.2 Configuration (`agent/config.py`)

Settings via `pydantic-settings` (reads from `.env`):

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8000` | Service port |
| `BACKEND_URL` | `http://localhost:4000` | Node.js gateway URL |
| `INTERNAL_SERVICE_TOKEN` | — | Shared secret for internal calls |
| `LLM_PROVIDER` | `gemini` | `gemini` or `ollama` |
| `GEMINI_API_KEY` | — | Google Gemini API key |
| `GEMINI_MODEL` | `gemini-2.0-flash` | Generation model |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama URL (local dev) |
| `OLLAMA_MODEL` | `llama3.2` | Local Ollama model |

### 4.3 HTTP Router (`agent/routers/agent.py`)

**`POST /agent/run`** — Authenticated by `X-Internal-Token` header.

**Request:**
```json
{
  "question": "string",
  "tenant_id": "uuid",
  "agent_instance_id": "uuid",
  "conversation_id": "uuid",
  "user_id": "uuid"
}
```

**Response:**
```json
{
  "answer": "string",
  "citations": [...],
  "tool_used": "string | null",
  "approval_pending": false,
  "approval_id": "uuid | null"
}
```

Internally, the router builds an `AgentState` and calls `customer_support_graph.ainvoke(initial_state)`.

---

## 5. LangGraph Agent — The ReAct Brain

### 5.1 State Schema (`agent/graph/state.py`)

`AgentState` is a `TypedDict` carrying all per-request data through the graph:

| Field | Type | Purpose |
|---|---|---|
| `messages` | `list[BaseMessage]` | Conversation history (append-only via `add_messages`) |
| `context` | `list[dict]` | RAG chunks: `{text, documentName, section, page, score}` |
| `citations` | `list[dict]` | Structured citations for DB persistence |
| `needs_retrieval` | `bool` | FLARE gate — skip Qdrant if `False` |
| `next_step` | `str` | `"tool_call"` or `"respond"` |
| `pending_tool_call` | `Optional[dict]` | `{name, arguments}` — queued tool |
| `tool_result` | `Optional[str]` | Result from last tool execution |
| `is_high_risk` | `bool` | Whether pending tool requires approval |
| `approval_id` | `Optional[str]` | UUID of pending `ApprovalRequest` |
| `approval_status` | `Optional[str]` | `"pending"` / `"approved"` / `"rejected"` |
| `tenant_id` | `str` | Immutable request context |
| `agent_instance_id` | `str` | For ToolBinding allowlist check |
| `conversation_id` | `str` | Immutable request context |
| `question` | `str` | Original user question |
| `user_id` | `str` | For audit logging |

### 5.2 Graph Topology (`agent/graph/graph.py`)

```
START
  │
  ▼
intent_classifier ──────────────────────────────────────────────────────┐
  │                                                                      │
  ▼                                                                      │
retriever  (skips if needs_retrieval=False)                             │
  │                                                                      │
  ▼                                                                      │
reasoning ◄──────────────────────────────────────────────────────────── ┘
  │                                                                      ▲
  ├── next_step="tool_call" + is_high_risk=True ──► approval_checkpoint  │
  │                                                    │ approved         │
  │                                                    ▼                  │
  ├── next_step="tool_call" + is_high_risk=False ──► tool_executor ──────┘
  │                                                    (ReAct loop)
  └── next_step="respond" ──► END
```

**Routing functions:**
- `_route_after_reasoning()` — sends to `approval_checkpoint` (high-risk), `tool_executor` (low-risk), or `END` (respond).
- `_route_after_approval()` — sends to `tool_executor` (approved) or `END` (rejected).
- `tool_executor → reasoning` — the ReAct loop: tool result feeds back for re-reasoning.

### 5.3 Node Details

#### `intent_classifier_node`
- Uses LLM with a one-shot system prompt to classify the question.
- Returns `RETRIEVE` or `SKIP` → sets `needs_retrieval` boolean.
- Implements FLARE-style selective retrieval (skips Qdrant for tool-only queries like order lookups, reducing latency).

#### `retriever_node`
- If `needs_retrieval=False`, returns `{}` (no-op).
- Calls `query_rag()` → HTTP POST to `/internal/rag/query` on the Node.js backend.
- Writes an audit log entry on every retrieval.
- Returns `{context, citations}` to populate the state.

#### `reasoning_node`
- Fetches allowed tools via `get_tools_for_agent(agent_instance_id)`.
- Binds tools to LLM: `llm.bind_tools(tools)`.
- Builds system prompt with document excerpts from `state.context`.
- If LLM returns a tool call: sets `next_step="tool_call"`, `pending_tool_call`, and `is_high_risk` (checked against `HIGH_RISK_TOOLS = {"escalate_to_human", "issue_refund", "process_payment"}`).
- If LLM returns a text answer: sets `next_step="respond"`.

#### `approval_checkpoint_node`
- Creates an `ApprovalRequest` in Postgres via `POST /internal/approvals`.
- Writes audit log entry.
- Appends a user-facing pending message with the approval reference ID.
- Sets `approval_status="pending"` — graph pauses here until external `PATCH /approvals/:id` resolves it.

#### `tool_executor_node`
- **Stage 1 — ToolBinding allowlist:** checks `get_allowed_tools(agent_instance_id)`. Rejects if tool not permitted.
- **Stage 2 — Pydantic validation:** validates `arguments` against `TOOL_INPUT_MODELS[tool_name]`. Rejects malformed inputs.
- **Stage 3 — Execute + audit:** calls the async tool function, writes audit log, returns `ToolMessage` with result.
- On error at any stage: returns an error `ToolMessage`, clearing `pending_tool_call`.

---

## 6. Tool Gateway (MCP)

### 6.1 FastMCP Server (`agent/tool_gateway/server.py`)

Mounted at `/mcp` using **Streamable HTTP** transport. Exposes tools to external MCP clients. The agent's `tool_executor` uses `TOOL_REGISTRY` directly (in-process, zero HTTP overhead).

### 6.2 Tool Registry (`agent/tool_gateway/registry.py`)

Central registry with three representations per tool:

| Registry | Type | Used by |
|---|---|---|
| `TOOL_REGISTRY` | `dict[str, Callable]` | `tool_executor` (direct execution) |
| `TOOL_INPUT_MODELS` | `dict[str, type]` | `tool_executor` (Pydantic validation) |
| `LANGCHAIN_TOOLS` | `list[StructuredTool]` | `reasoning_node` (LLM binding) |

**`get_allowed_tools(agent_instance_id)`** — Phase 3: returns all tools. Phase 4: will query `ToolBinding` table per agent.

### 6.3 Registered Tools

| Tool | Risk Level | Input Schema |
|---|---|---|
| `check_order_status` | Low (direct exec) | `order_id: str` |
| `escalate_to_human` | **High** (approval required) | `reason: str`, `action_payload: Optional[dict]` |

> **Phase 3 note:** `check_order_status` uses mock data (`MOCK_ORDERS` dict). Phase 4 replaces this with a real Postgres query against an `orders` table.

---

## 7. LLM & Embedding Gateway

### 7.1 LLM Gateway (`agent/services/llm_gateway.py`)

Provider-agnostic abstraction cached via `@lru_cache(maxsize=1)`:

| `LLM_PROVIDER` | Class | Config |
|---|---|---|
| `gemini` | `ChatGoogleGenerativeAI` | `gemini-2.0-flash`, `temperature=0.1` |
| `ollama` | `ChatOllama` | Local model, zero API cost |

Switching providers requires only changing the `.env` variable — no code changes.

### 7.2 Embedding Service (`backend/src/services/embeddings.js`)

| Parameter | Value |
|---|---|
| Model | `gemini-embedding-001` (env-configurable) |
| Dimension | `768` (env-configurable) |
| Task types | `RETRIEVAL_DOCUMENT` (indexing), `RETRIEVAL_QUERY` (search) |

Embeddings are generated sequentially (no batching yet) via `@google/genai` SDK.

---

## 8. RAG Pipeline

### 8.1 Document Ingestion (`backend/src/services/ingestion.js`)

```
Upload (PDF/DOCX buffer)
  │
  ▼
extractText()        ← pdf-parse (PDF) | mammoth (DOCX → Markdown)
  │
  ▼
chunkDocument()      ← content-aware: headings → paragraphs → sentences
  │
  ▼
embedDocumentChunks() ← Gemini embedding-001 (RETRIEVAL_DOCUMENT)
  │
  ▼
upsertChunks()       ← Qdrant batch upsert (50 points/batch)
  │
  ▼
PostgreSQL UPDATE     ← status='ready', chunk_count=N
```

**Chunking strategy** (`backend/src/services/chunking.js`):
- Max chunk: **1,500 characters** with **100-character overlap**.
- Splits at: detected section headings → double-newline paragraphs → sentence boundaries.
- Each chunk carries full metadata: `document_id`, `document_name`, `tenant_id`, `chunk_index`, `section`, `page`, `char_count`.
- Fallback: splits full text at sentence boundaries if no structure is detected.

**Text extraction** (`backend/src/services/extraction.js`):
- **PDF:** `pdf-parse` → page-by-page split on form-feed (`\f`).
- **DOCX:** `mammoth.convertToMarkdown()` → preserves heading structure for chunker.

### 8.2 Vector Search (`backend/src/services/qdrant.js`)

- Single Qdrant collection: `document_chunks` (configurable via `QDRANT_COLLECTION`).
- Cosine distance, dimension 768.
- Payload indexes on `tenant_id` (keyword) and `document_id` (keyword).
- **Tenant filter is mandatory** on every search — `must: [{ key: 'tenant_id', match: { value: tenantId } }]`.
- Default: `limit=5`, `score_threshold=0.5`.

### 8.3 RAG Answer Generation (`backend/src/services/rag.js`)

```
question → embedQuery() → searchByTenant() → formatChunksAsContext()
  → buildPrompt() → Gemini generateContent() → answer + citations[]
```

System prompt instructs the LLM to answer **only** from provided excerpts, cite inline with `[1]`, `[2]` markers, and respond with a fixed message if no relevant content is found.

---

## 9. Data Model (PostgreSQL)

### 9.1 Schema Overview

```
tenants (id, name, is_active, created_at)
  │
  ├── users (id, tenant_id, email, role, hashed_password, created_at)
  │
  ├── agent_instances (id, tenant_id, name, config JSONB, is_active, created_at)
  │
  ├── documents (id, tenant_id, filename, mime_type, chunk_count, status, error_message, created_at)
  │
  ├── conversations (id, tenant_id, agent_instance_id?, customer_identifier, status, created_at, updated_at)
  │     └── messages (id, conversation_id, tenant_id, role, content, citations_json JSONB, agent_run_id?, created_at)
  │
  ├── approval_requests (id, tenant_id, conversation_id?, action_type, action_payload JSONB, status, created_at, resolved_at)
  │
  └── audit_logs (id, tenant_id, event_type, payload JSONB, created_at)
```

### 9.2 RBAC Roles

| Role | Permissions |
|---|---|
| `admin` | Full access — all routes including document delete and approval decisions |
| `employee` | Conversations (read/write), document upload, no approval management |
| `reviewer` | Read-only conversations, approval decisions (approve/reject) |

### 9.3 Row Level Security (RLS)

**Migration 002** enables PostgreSQL RLS on all tables. Every query is scoped by setting the session variable `app.tenant_id` before execution:

```js
// backend/src/db/index.js
await client.query(`SET app.tenant_id = '${tenantId}'`);
```

RLS policies enforce `tenant_id = current_setting('app.tenant_id')::UUID` on every table, making cross-tenant data leaks impossible at the database level.

---

## 10. Security Architecture

### 10.1 Authentication

- **JWT** (`jsonwebtoken`) signed with `JWT_SECRET`.
- Token payload: `{ userId, tenantId, role, email }`.
- `authenticate` middleware validates signature + expiry; injects `req.user`.

### 10.2 Inter-Service Authentication

The Node.js backend and Python agent share a symmetric `INTERNAL_SERVICE_TOKEN`:

- **Outbound (Node→Agent):** `X-Internal-Token` header on `POST /agent/run`.
- **Outbound (Agent→Node):** same header on all `/internal/*` calls.
- `/internal` router validates the token before any handler runs.
- The agent service's CORS is restricted to `http://localhost:4000` — it is never publicly reachable.

### 10.3 Password Storage

`bcryptjs` with `saltRounds=12`. Passwords are never stored in plaintext.

### 10.4 HTTP Hardening

`helmet()` sets standard security headers (CSP, HSTS, X-Frame-Options, etc.) on every response.

### 10.5 Tool Execution Safety (Three-Stage)

1. **ToolBinding allowlist** — agent can only call tools it is explicitly permitted to use.
2. **Pydantic validation** — rejects malformed, injected, or out-of-spec tool arguments.
3. **Audit log** — every tool execution (and failure) is written to `audit_logs` before returning.

---

## 11. Audit & Observability

Every significant action writes an entry to `audit_logs`:

| Event Type | Triggered By |
|---|---|
| `conversation_started` | `POST /api/conversations` |
| `document_uploaded` | `POST /api/documents` |
| `document_deleted` | `DELETE /api/documents/:id` |
| `rag_query` | `retriever_node` |
| `approval_requested` | `approval_checkpoint_node` |
| `approval_decision` | `PATCH /api/conversations/approvals/:id` |
| `tool_executed` | `tool_executor_node` |

Audit writes from the agent are **fire-and-forget** (errors are logged to console, not propagated) so that an audit failure never blocks the user response.

---

## 12. Human-in-the-Loop Approval Flow

```
User sends message
  └─► reasoning_node decides: escalate_to_human (HIGH_RISK)
        └─► approval_checkpoint_node
              ├── Creates ApprovalRequest (status='pending') in Postgres
              ├── Writes audit log
              └── Returns pending message to user ("A reviewer has been notified...")

Later, reviewer calls:
  PATCH /api/conversations/approvals/:id  { decision: "approved" | "rejected" }
    └─► Updates approval_requests.status
    └─► Writes audit log (approval_decision)
```

> **Note:** In the current Phase 3 implementation, the graph is not resumed after approval. The approval record is created and the conversation is notified, but resuming the graph run for post-approval tool execution is a Phase 4 deliverable.

---

## 13. Document Ingestion File Support

| Format | Library | Notes |
|---|---|---|
| PDF | `pdf-parse` | Page-by-page extraction, preserves page numbers |
| DOCX | `mammoth` | Converts to Markdown to preserve heading structure |
| Max size | 20 MB | Enforced by `multer` before reaching ingestion |

---

## 14. Directory Structure

```
Enterprise AI Workflow Platform/
├── docker-compose.yml          ← postgres, qdrant, redis
├── .env.example
│
├── agent/                      ← Python FastAPI + LangGraph
│   ├── main.py                 ← App entry point, MCP mount
│   ├── config.py               ← pydantic-settings
│   ├── requirements.txt
│   ├── routers/
│   │   └── agent.py            ← POST /agent/run
│   ├── graph/
│   │   ├── state.py            ← AgentState TypedDict
│   │   ├── graph.py            ← LangGraph build_graph()
│   │   └── nodes/
│   │       ├── intent_classifier.py
│   │       ├── retriever.py
│   │       ├── reasoning.py
│   │       ├── approval_checkpoint.py
│   │       └── tool_executor.py
│   ├── services/
│   │   ├── llm_gateway.py      ← Gemini / Ollama abstraction
│   │   ├── rag_client.py       ← HTTP client → /internal/rag/query
│   │   └── db_client.py        ← HTTP client → /internal/approvals, /internal/audit
│   └── tool_gateway/
│       ├── server.py           ← FastMCP server
│       ├── registry.py         ← TOOL_REGISTRY, TOOL_INPUT_MODELS, LANGCHAIN_TOOLS
│       └── tools/
│           ├── check_order_status.py
│           └── escalate_to_human.py
│
├── backend/                    ← Node.js Express API Gateway
│   ├── src/
│   │   ├── index.js            ← App entry point
│   │   ├── db/index.js         ← pg Pool + RLS-aware query()
│   │   ├── middleware/
│   │   │   ├── auth.js         ← JWT verification
│   │   │   └── rbac.js         ← Role-based access control
│   │   ├── routes/
│   │   │   ├── auth.js         ← /api/auth
│   │   │   ├── conversations.js← /api/conversations
│   │   │   ├── documents.js    ← /api/documents
│   │   │   └── internal.js     ← /internal (agent-only)
│   │   └── services/
│   │       ├── extraction.js   ← PDF/DOCX text extraction
│   │       ├── chunking.js     ← Content-aware text chunking
│   │       ├── embeddings.js   ← Gemini embedding-001
│   │       ├── qdrant.js       ← Vector DB client
│   │       ├── rag.js          ← Retrieve + generate answer
│   │       └── ingestion.js    ← Full document pipeline
│   └── database/
│       └── migrations/
│           ├── 001_initial_schema.sql
│           ├── 002_row_level_security.sql
│           ├── 003_add_password_to_users.sql
│           ├── 004_documents.sql
│           └── 005_messages_citations.sql
│
├── frontend/                   ← (empty — not yet implemented)
└── docs/
    └── architecture_overview.md  ← this file
```

---

## 15. Key Design Decisions

| Decision | Rationale |
|---|---|
| **Separate Python service for agent** | LangGraph + LangChain ecosystem; async graph execution not easily done in Node.js |
| **All Qdrant access in Node.js** | Single source of truth for RAG; agent stays stateless re: vector DB |
| **Agent calls Node.js for DB writes** | Tenant isolation logic (RLS + tenantId scoping) lives in one place |
| **RLS at DB level** | Cross-tenant leaks impossible even with app-layer bugs |
| **FastMCP for tools** | MCP protocol compatibility for external tool clients; in-process `TOOL_REGISTRY` for agent speed |
| **FLARE-style intent classification** | Avoids unnecessary Qdrant round-trips for tool-only queries (order lookups, greetings) |
| **`lru_cache` on LLM instance** | Avoids re-initializing API client per request |
| **Fire-and-forget audit writes** | Audit failures never degrade user experience |
| **Three-stage tool validation** | Defense-in-depth: allowlist → schema → execution, with audit at execution |
| **Pydantic-settings for config** | Type-safe, env-file based, zero boilerplate |

---

## 16. Phase Roadmap

| Phase | Status | Key Deliverables |
|---|---|---|
| **Phase 1** | ✅ Complete | PostgreSQL schema, RLS, JWT auth, RBAC |
| **Phase 2** | ✅ Complete | RAG pipeline (extraction → chunking → embedding → Qdrant → generation) |
| **Phase 3** | ✅ Complete | LangGraph agent, FastMCP tool gateway, approval checkpoint, audit logging |
| **Phase 4** | 🔲 Planned | Real order DB queries, ToolBinding table per agent, graph resume after approval, frontend UI |
