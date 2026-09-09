-- Migration 042: Sales Agent WhatsApp Integration
-- Adds contact_phone, whatsapp_status, outreach_channel, and whatsapp_message_id to sales_prospects

ALTER TABLE sales_prospects ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(50);
ALTER TABLE sales_prospects ADD COLUMN IF NOT EXISTS whatsapp_status VARCHAR(50) DEFAULT 'UNVERIFIED';
ALTER TABLE sales_prospects ADD COLUMN IF NOT EXISTS outreach_channel VARCHAR(20) DEFAULT 'email';
ALTER TABLE sales_prospects ADD COLUMN IF NOT EXISTS whatsapp_message_id VARCHAR(100);
ALTER TABLE sales_prospects ADD COLUMN IF NOT EXISTS last_channel_used VARCHAR(20) DEFAULT 'email';

CREATE INDEX IF NOT EXISTS idx_sales_prospects_phone ON sales_prospects(tenant_id, contact_phone);
CREATE INDEX IF NOT EXISTS idx_sales_prospects_wa_status ON sales_prospects(whatsapp_status);
CREATE INDEX IF NOT EXISTS idx_sales_prospects_channel ON sales_prospects(outreach_channel);

SELECT 'Migration 042 applied successfully' AS status;
