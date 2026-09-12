-- Rename Paddle columns to generic payment provider columns if they exist
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tenants' AND column_name = 'paddle_subscription_id'
    ) THEN
        ALTER TABLE tenants RENAME COLUMN paddle_subscription_id TO payment_subscription_id;
    END IF;
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tenants' AND column_name = 'paddle_customer_id'
    ) THEN
        ALTER TABLE tenants RENAME COLUMN paddle_customer_id TO payment_customer_id;
    END IF;
END $$;

-- Add SafePay-specific columns
ALTER TABLE tenants 
    ADD COLUMN IF NOT EXISTS safepay_plan_id VARCHAR(255),
    ADD COLUMN IF NOT EXISTS safepay_reference VARCHAR(255),
    ADD COLUMN IF NOT EXISTS payment_provider VARCHAR(50) DEFAULT 'safepay',
    ADD COLUMN IF NOT EXISTS subscription_renews_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS billing_cycle VARCHAR(20) DEFAULT 'monthly' 
        CHECK (billing_cycle IN ('monthly', 'yearly'));

-- Create webhook events log for idempotency
CREATE TABLE IF NOT EXISTS webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id VARCHAR(255) UNIQUE NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_event_id ON webhook_events(event_id);