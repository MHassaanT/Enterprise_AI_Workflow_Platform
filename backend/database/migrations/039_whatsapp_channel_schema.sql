-- Migration 039: WhatsApp Channel Schema & Baileys Session Storage
-- Multi-tenant WhatsApp Web connectivity via Baileys with Postgres auth persistence and RLS

-- 1. Add channel column to conversations table
ALTER TABLE conversations 
  ADD COLUMN IF NOT EXISTS channel VARCHAR(20) DEFAULT 'web'
  CHECK (channel IN ('web', 'whatsapp', 'email'));

CREATE INDEX IF NOT EXISTS idx_conversations_channel 
  ON conversations(tenant_id, channel);

-- 2. WhatsApp session storage (per-tenant Baileys credentials & connection status)
CREATE TABLE IF NOT EXISTS whatsapp_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    phone_number VARCHAR(30),
    creds_data TEXT,                       -- AES-256-GCM encrypted Baileys creds JSON
    status VARCHAR(30) DEFAULT 'disconnected'
      CHECK (status IN ('disconnected', 'connecting', 'qr_pending', 'connected')),
    connected_at TIMESTAMPTZ,
    disconnected_at TIMESTAMPTZ,
    last_qr_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_tenant ON whatsapp_sessions(tenant_id);

-- 3. WhatsApp auth keys (Baileys pre-keys, session keys, sender keys)
CREATE TABLE IF NOT EXISTS whatsapp_auth_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    key_category VARCHAR(50) NOT NULL,     -- 'pre-key', 'session', 'sender-key', 'app-state-sync-key', etc.
    key_id VARCHAR(255) NOT NULL,          -- Baileys key identifier
    key_data TEXT NOT NULL,                -- AES-256-GCM encrypted key JSON
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, key_category, key_id)
);

CREATE INDEX IF NOT EXISTS idx_wa_auth_keys_lookup 
  ON whatsapp_auth_keys(tenant_id, key_category, key_id);

-- 4. WhatsApp message log (delivery audit trail & cross-channel tracking)
CREATE TABLE IF NOT EXISTS whatsapp_message_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    message_id VARCHAR(255),               -- Baileys message ID
    direction VARCHAR(10) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    sender_jid VARCHAR(100) NOT NULL,
    recipient_jid VARCHAR(100) NOT NULL,
    content_type VARCHAR(50) DEFAULT 'text',
    content_preview TEXT,                  -- Sanitized preview for audit
    status VARCHAR(30) DEFAULT 'sent'
      CHECK (status IN ('sent', 'delivered', 'read', 'failed')),
    error_message TEXT,
    wa_timestamp TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wa_msg_log_tenant 
  ON whatsapp_message_log(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_msg_log_conv 
  ON whatsapp_message_log(conversation_id);

-- 5. Row-Level Security (RLS)
ALTER TABLE whatsapp_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_auth_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_message_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_wa_sessions ON whatsapp_sessions;
CREATE POLICY tenant_isolation_wa_sessions ON whatsapp_sessions
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::UUID);

DROP POLICY IF EXISTS tenant_isolation_wa_auth_keys ON whatsapp_auth_keys;
CREATE POLICY tenant_isolation_wa_auth_keys ON whatsapp_auth_keys
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::UUID);

DROP POLICY IF EXISTS tenant_isolation_wa_msg_log ON whatsapp_message_log;
CREATE POLICY tenant_isolation_wa_msg_log ON whatsapp_message_log
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::UUID);

SELECT 'Migration 039 completed successfully' AS migration_status;
