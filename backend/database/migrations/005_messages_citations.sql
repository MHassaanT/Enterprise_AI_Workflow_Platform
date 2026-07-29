-- Add citations_json column to persist which document chunks backed each assistant response.
-- Required for the audit/explainability requirement (spec section 13.4).
ALTER TABLE messages ADD COLUMN IF NOT EXISTS citations_json JSONB DEFAULT '[]';

-- Track which graph run produced this message (for debugging and tracing).
ALTER TABLE messages ADD COLUMN IF NOT EXISTS agent_run_id UUID;
