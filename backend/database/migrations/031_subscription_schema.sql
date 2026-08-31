-- Migration 031: Subscription & Email Verification Schema
-- Adds subscription billing fields to tenants and email verification to users.

-- ── Tenant Subscription Fields ──
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subscription_plan VARCHAR(50) DEFAULT 'none'
    CHECK (subscription_plan IN ('none', 'basic', 'pro', 'enterprise'));
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(50) DEFAULT 'pending_verification'
    CHECK (subscription_status IN ('pending_verification', 'trialing', 'active', 'past_due', 'canceled', 'paused'));
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS paddle_subscription_id VARCHAR(255);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS paddle_customer_id VARCHAR(255);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subscription_updated_at TIMESTAMPTZ;

-- ── User Email Verification Fields ──
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_sent_at TIMESTAMPTZ;