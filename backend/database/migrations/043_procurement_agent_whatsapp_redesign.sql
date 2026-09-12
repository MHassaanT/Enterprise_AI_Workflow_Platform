-- Migration 043: Procurement Agent WhatsApp & Places Redesign
-- Transitions Procurement Agent to WhatsApp-only outreach, Google Places discovery, and interview scheduling

ALTER TABLE procurement_vendors ADD COLUMN IF NOT EXISTS vendor_phone VARCHAR(50);
ALTER TABLE procurement_vendors ADD COLUMN IF NOT EXISTS whatsapp_status VARCHAR(50) DEFAULT 'ON_WHATSAPP';
ALTER TABLE procurement_vendors ADD COLUMN IF NOT EXISTS whatsapp_message_id VARCHAR(100);
ALTER TABLE procurement_vendors ADD COLUMN IF NOT EXISTS place_id VARCHAR(255);
ALTER TABLE procurement_vendors ADD COLUMN IF NOT EXISTS google_rating NUMERIC(3, 2);
ALTER TABLE procurement_vendors ADD COLUMN IF NOT EXISTS review_count INTEGER DEFAULT 0;
ALTER TABLE procurement_vendors ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE procurement_vendors ADD COLUMN IF NOT EXISTS interview_requested_at TIMESTAMPTZ;
ALTER TABLE procurement_vendors ADD COLUMN IF NOT EXISTS interview_availability TEXT;
ALTER TABLE procurement_vendors ADD COLUMN IF NOT EXISTS appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL;
ALTER TABLE procurement_vendors ALTER COLUMN vendor_email DROP NOT NULL;

ALTER TABLE procurement_requests ADD COLUMN IF NOT EXISTS appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL;
ALTER TABLE procurement_requests ADD COLUMN IF NOT EXISTS interview_scheduled_at TIMESTAMPTZ;

-- Allow appointments to have optional email if vendor is identified by WhatsApp/Phone
ALTER TABLE appointments ALTER COLUMN customer_email DROP NOT NULL;

-- Index for rapid vendor phone resolution on inbound WhatsApp messages
CREATE INDEX IF NOT EXISTS idx_procurement_vendors_phone ON procurement_vendors(vendor_phone);
CREATE INDEX IF NOT EXISTS idx_procurement_vendors_whatsapp ON procurement_vendors(whatsapp_status);
CREATE INDEX IF NOT EXISTS idx_procurement_requests_appt ON procurement_requests(appointment_id);
