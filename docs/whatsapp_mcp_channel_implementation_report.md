# WhatsApp MCP Channel Integration Report

## Executive Summary

This document details the architectural design, security model, API specifications, and implementation details for integrating **WhatsApp** as a second official contact channel alongside Email within the Enterprise AI Workflow Platform.

The integration utilizes the **Baileys library (`@whiskeysockets/baileys`)** embedded directly within the platform's Node.js backend. It features **PostgreSQL-backed AES-256-GCM authentication persistence**, **strict multi-tenancy enforced through PostgreSQL Row-Level Security (RLS)**, **Redis Pub/Sub real-time QR streaming via Server-Sent Events (SSE)**, **bidirectional message synchronization with the LangGraph agent service**, and an interactive **Frontend Integration Hub UI card and pairing modal**.

---

## 1. Architectural Overview & System Topology

The WhatsApp MCP Channel is embedded directly into the Node.js backend (`backend/`) under the dedicated module `mcp/whatsapp/`. This architecture eliminates inter-container network latency, shares the existing PostgreSQL connection pool and Redis clients, and allows long-lived WhatsApp Web WebSockets to run seamlessly alongside platform APIs.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       Frontend Integration Hub (:3000)                      │
│      (/mcp - WhatsApp Card, Real-Time QR Pairing Modal, Live SSE Stream)     │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ HTTP REST & SSE (/api/whatsapp/qr-stream)
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Node.js Express API Gateway (:4000)                      │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │             Embedded WhatsApp MCP Module (mcp/whatsapp/)              │  │
│  │                                                                       │  │
│  │  - WhatsAppConnectionManager (Map<tenantId, WASocket>)                │  │
│  │  - usePostgresAuthState (Custom AES-256-GCM DB Auth Adapter)          │  │
│  │  - WhatsAppMessageHandler (Inbound Parsing, Conversation Tagging)     │  │
│  │  - WhatsAppMediaHandler (Images, Documents, Audio, Video Formatter)   │  │
│  └───────────────────────────────────┬───────────────────────────────────┘  │
│                                      │                                      │
│  API Routes:                         │ Database Pool (db/index.js)          │
│   - /api/whatsapp/* (Auth/Admin)     │   - SET app.tenant_id = $tenantId    │
│   - /internal/whatsapp/* (Tokens)    │                                      │
└───────────────────┬──────────────────┴───────────────────┬──────────────────┘
                    │                                      │
    POST /agent/run │ X-Internal-Token                     │ PostgreSQL RLS Queries
    (Agent Dispatch)│                                      ▼
                    ▼                          ┌──────────────────────────────┐
┌──────────────────────────────────────────┐   │    PostgreSQL 15 Database    │
│       Python Agent Service (:8000)       │   │                              │
│                                          │   │  - conversations (channel)   │
│  - LangGraph Customer Support Graph      │   │  - whatsapp_sessions (RLS)   │
│  - Centralized Tool Gateway Router       │   │  - whatsapp_auth_keys (RLS)  │
│  - WhatsApp Python Adapter               │   │  - whatsapp_message_log(RLS) │
│  - Dynamic Tool Schema (WhatsAppDynamic) │   │  - tool_registry (seeded)    │
└──────────────────────────────────────────┘   └──────────────────────────────┘
                    ▲                                      ▲
                    │                                      │
                    └─────────── Redis 7 (Pub/Sub) ────────┘
                      Channel: whatsapp:events:{tenantId}
```

---

## 2. Multi-Tenant Baileys Architecture & PostgreSQL Auth State

### The Challenge with Filesystem Sessions
Default Baileys implementations rely on `useMultiFileAuthState`, storing credentials and cryptographic keys on the local disk. In a cloud-native, multi-tenant platform, disk-based authentication introduces severe vulnerabilities:
1. Session state is lost when containers restart or scale horizontally.
2. Cross-tenant credential bleed is possible if filesystem directories are misconfigured.
3. Secrets are stored in plaintext on disk.

### The Solution: `usePostgresAuthState`
We developed a custom PostgreSQL authentication adapter ([`postgres-auth-state.js`](file:///home/hassaan/Desktop/Projects/Enterprise%20AI%20Workflow%20Platform/mcp/whatsapp/src/postgres-auth-state.js)) implementing Baileys' `AuthenticationState` interface:

```javascript
const usePostgresAuthState = async (tenantId, dbQuery) => {
  // 1. Fetch encrypted creds from whatsapp_sessions
  // 2. Build SignalKeyStore (get, set) reading/writing to whatsapp_auth_keys
  // 3. Encrypt all payloads with AES-256-GCM before DB write
  // 4. Return { state: { creds, keys }, saveCreds }
};
```

#### Security Model
- **Encryption at Rest**: All sensitive authentication state (noise keys, identity keys, pre-keys, and session state) is serialized using Baileys' `BufferJSON` replacer and encrypted using **AES-256-GCM** with a random 12-byte initialization vector (IV) and 16-byte authentication tag: `nonce_hex:ciphertext_hex`.
- **Database Partitioning**:
  - `whatsapp_sessions`: Stores tenant-level session metadata, connection status, paired phone number, and encrypted credentials JSON. Unique constraint on `(tenant_id)`.
  - `whatsapp_auth_keys`: Stores individual cryptographic keys partitioned by `(tenant_id, key_category, key_id)`. Keys include `pre-key`, `session`, `sender-key`, and `app-state-sync-key`.

---

## 3. Communication Channel Abstraction

WhatsApp is integrated alongside Email as a primary communication channel:

### Database Schema Enhancement
The `conversations` table has been enhanced with a channel classification column:
```sql
ALTER TABLE conversations 
  ADD COLUMN IF NOT EXISTS channel VARCHAR(20) DEFAULT 'web'
  CHECK (channel IN ('web', 'whatsapp', 'email'));

CREATE INDEX IF NOT EXISTS idx_conversations_channel 
  ON conversations(tenant_id, channel);
```
- **Backward Compatibility**: Existing database records and explicit-column insert queries default to `'web'` with zero schema degradation or breaking changes.
- **Inbound Conversation Resolution**: When a WhatsApp message arrives, the system queries:
  ```sql
  SELECT id, agent_instance_id FROM conversations 
  WHERE tenant_id = $1 
    AND customer_identifier = $2 
    AND channel = 'whatsapp' 
    AND status = 'active'
  ORDER BY updated_at DESC LIMIT 1;
  ```
  If no active conversation exists, a new conversation is automatically provisioned for the tenant and linked to the tenant's default Customer Support agent instance.

### Audit & Message Delivery Logging
Every inbound and outbound message is recorded in `whatsapp_message_log` with Row-Level Security:
- `direction`: `'inbound'` or `'outbound'`
- `sender_jid`: e.g. `923001234567@s.whatsapp.net`
- `recipient_jid`: e.g. `15551234567@s.whatsapp.net`
- `content_preview`: Sanitized preview text (up to 500 characters)
- `status`: `'sent'`, `'delivered'`, `'read'`, or `'failed'`

---

## 4. Inbound & Outbound Messaging Pipeline

### Inbound Flow
1. **Event Capture**: The tenant's `WASocket` receives a `messages.upsert` event of type `'notify'`.
2. **Filtering**: Status broadcasts (`@broadcast`), newsletters, and self-sent messages (`key.fromMe = true`) are filtered out.
3. **Payload Extraction**: [`media-handler.js`](file:///home/hassaan/Desktop/Projects/Enterprise%20AI%20Workflow%20Platform/mcp/whatsapp/src/media-handler.js) and [`message-handler.js`](file:///home/hassaan/Desktop/Projects/Enterprise%20AI%20Workflow%20Platform/mcp/whatsapp/src/message-handler.js) parse raw text, captions, or media attachments (images, audio, video, documents).
4. **Conversation Persistence**: The message is saved to `messages` (`role = 'user'`) linked to the tenant's WhatsApp conversation.
5. **Agent Reasoning**: The Node.js gateway issues an authenticated call to the Python service (`POST /agent/run`) passing `question`, `tenant_id`, `agent_instance_id`, `conversation_id`, and conversation history.
6. **Direct RAG Fallback**: If the Python agent microservice is unreachable, the gateway executes direct document retrieval via `answerWithRAG()`.
7. **Outbound Dispatch**: The assistant's generated response is persisted to `messages` (`role = 'assistant'`) and dispatched back to the customer's phone number via `sock.sendMessage(remoteJid, { text: answer })`.

### Outbound Flow (Agent Tools)
Agents can proactively or reactively dispatch WhatsApp messages via platform tools:
- `whatsapp_send_message`: Sends plain-text messages.
- `whatsapp_send_media`: Sends documents (PDFs, invoices), images, audio, or video with optional captions.
- `whatsapp_get_status`: Inspects live pairing state.

The Python `whatsapp_adapter.py` issues an authenticated request to `POST /internal/whatsapp/send` with `X-Internal-Token`. The backend resolves the tenant's socket from `WhatsAppConnectionManager` and transmits the message via WhatsApp Web protocol.

---

## 5. Real-Time QR Pairing & Streaming Architecture

### Server-Sent Events (SSE) & Redis Pub/Sub
WhatsApp Web multi-device authentication requires scanning a time-sensitive QR code. To support real-time rendering in the browser without high-frequency HTTP polling:

1. **Redis Channel**: When Baileys emits a `connection.update` with `qr`, `WhatsAppConnectionManager` converts the raw code into a base64 Data URI PNG via `qrcode` and publishes it to Redis channel `whatsapp:events:{tenantId}`.
2. **SSE Gateway Endpoint**: The frontend connects to `GET /api/whatsapp/qr-stream?token=<JWT>`. The route establishes an SSE stream and subscribes to the tenant's Redis channel.
3. **Event Types**:
   - `status`: `{ status: 'connecting' | 'qr_pending' | 'connected' | 'disconnected', phoneNumber }`
   - `qr`: `{ qr: 'data:image/png;base64,...', tenantId }`
4. **Offline Redis Fallback**: If Redis is temporarily offline, the SSE route automatically switches to an in-memory status poller at 2-second intervals, ensuring the UI remains functional under all operational conditions.

---

## 6. Supported API Endpoints

### Public & Authenticated Gateway Routes (`backend/src/routes/whatsapp.js`)

| HTTP Method | Route | RBAC / Auth | Description |
|---|---|---|---|
| `POST` | `/api/whatsapp/connect` | `authenticate`, `authorize('admin')` | Initiates WhatsApp connection/pairing for the active tenant. Accepts `{ forceNew: true }` to regenerate QR. |
| `DELETE` | `/api/whatsapp/disconnect` | `authenticate`, `authorize('admin')` | Disconnects the WhatsApp session, unregisters listeners, and purges cryptographic keys from PostgreSQL. |
| `GET` | `/api/whatsapp/status` | `authenticate`, `authorize('admin', 'employee')` | Returns current connection status, paired phone number, and last QR timestamp. |
| `GET` | `/api/whatsapp/qr-stream` | `authenticateSSE` (Header or `?token=`) | Server-Sent Events (SSE) stream delivering real-time QR codes and connection state transitions. |
| `GET` | `/api/whatsapp/conversations` | `authenticate`, `authorize('admin', 'employee')` | Lists all customer support conversations originating from WhatsApp. |
| `POST` | `/api/whatsapp/check-number` | `authenticate`, `authorize('admin', 'employee')` | Invokes Baileys `sock.onWhatsApp()` to verify if one or more phone numbers are registered on WhatsApp. |

### Internal Agent Execution Routes (`backend/src/routes/internal.js`)

| HTTP Method | Route | Auth Guard | Description |
|---|---|---|---|
| `POST` | `/internal/whatsapp/send` | `X-Internal-Token` | Internal tool execution endpoint called by Python agent to send text or media messages. |
| `GET` | `/internal/whatsapp/status/:tenantId` | `X-Internal-Token` | Internal endpoint for checking tenant WhatsApp pairing status from agent tools. |
| `POST` | `/internal/whatsapp/check` | `X-Internal-Token` | Internal endpoint calling Baileys `onWhatsApp()` for agent tool number validation. |

---

## 7. Model Context Protocol (MCP) Tools Catalog

The tools are registered in `tool_registry` via database migration `040`:

| Canonical Name | Display Name | Provider Type | High-Risk? | Input Schema |
|---|---|---|---|---|
| `whatsapp_send_message` | Send WhatsApp Message | `whatsapp` | `false` | `{"type":"object","required":["to","message"],"properties":{"to":{"type":"string"},"message":{"type":"string"}}}` |
| `whatsapp_send_media` | Send WhatsApp Media | `whatsapp` | `false` | `{"type":"object","required":["to","media_url","media_type"],"properties":{"to":{"type":"string"},"media_url":{"type":"string"},"media_type":{"type":"string","enum":["image","document","audio","video"]},"caption":{"type":"string"},"filename":{"type":"string"}}}` |
| `whatsapp_get_status` | Get WhatsApp Connection Status | `whatsapp` | `false` | `{"type":"object","properties":{}}` |
| `whatsapp_check_number` | Check WhatsApp Number | `whatsapp` | `false` | `{"type":"object","required":["phone"],"properties":{"phone":{"type":"string","description":"Phone number to check via onWhatsApp()"}}}` |

---

## 8. Multi-Tenancy & Row-Level Security (RLS) Verification

Multi-tenancy is enforced at every layer:

1. **Database Layer**:
   - Every `whatsapp_*` table includes `tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`.
   - PostgreSQL RLS policies enforce `USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::UUID)`.
   - Every database query in `db/index.js` sets `SET app.tenant_id = '${tenantId}'`.
   - Programmatic `WHERE tenant_id = $1` filters are applied in all SQL statements for defense-in-depth.
2. **Process Layer**:
   - `WhatsAppConnectionManager` maintains an in-memory `Map<tenantId, session>`. Socket instances and event listeners are isolated per tenant ID.
3. **Streaming Layer**:
   - Redis pub/sub channels are isolated per tenant: `whatsapp:events:${tenantId}`. Clients cannot receive events belonging to other tenants.
4. **Agent Layer**:
   - `AgentState` passes `tenant_id` throughout LangGraph nodes. The WhatsApp adapter sends `tenantId` in every internal tool execution request.

---

## 9. Verification & Quality Assurance

### Automated Unit & Integration Suite
A comprehensive test suite ([`scratch/test_whatsapp.js`](file:///home/hassaan/.gemini/antigravity/brain/3d773cdf-e170-45c0-ad27-680ff3a85682/scratch/test_whatsapp.js)) was executed:

```bash
node ~/.gemini/antigravity/brain/3d773cdf-e170-45c0-ad27-680ff3a85682/scratch/test_whatsapp.js
```

**Results:**
- ✅ **Test 1 (AES-256-GCM Encryption)**: Confirmed that complex nested objects and binary Buffers are encrypted with distinct initialization vectors and decrypted with complete fidelity.
- ✅ **Test 2 (Postgres Auth State)**: Verified that Tenant B cannot access, read, or overwrite Tenant A's cryptographic pre-keys or session data.
- ✅ **Test 3 (Media Handler)**: Verified extraction of inbound media (images, documents) and correct formatting of outbound media payloads.
- ✅ **Test 4 (Message Text Extraction)**: Verified text extraction across conversation strings, extended text payloads, and media caption fallbacks.
- ✅ **Test 5 (Connection Manager & JID Normalization)**: Verified E.164 phone number formatting into standard WhatsApp JID formats (`<digits>@s.whatsapp.net`).

### Codebase Compilation & Linting
- **Node.js**: Clean syntax across all modules (`node -c`).
- **Python**: Clean compilation across all modules (`python3 -m py_compile`).
- **Next.js ESLint**: Zero errors, zero warnings (`npx eslint src/app/mcp/page.js`).

---

## 10. Operational Guidelines & Meta TOS Notice

> [!WARNING]
> **WhatsApp Terms of Service**: The Baileys library is an open-source reverse-engineered implementation of the WhatsApp Web WebSocket protocol. It is not endorsed by or affiliated with Meta Platforms, Inc.
> 
> To safeguard tenant telephone numbers against automated spam bans:
> 1. Restrict usage to reactive customer inquiries and operator communications.
> 2. Avoid unsolicited high-volume bulk marketing blasts.
> 3. Enforce rate limiting on outbound messaging tools.
> 4. Advise tenant administrators of these policies directly on the Integration Hub UI.

---
*Report compiled and verified on September 8, 2026. All source files and database migrations are active in the codebase.*
