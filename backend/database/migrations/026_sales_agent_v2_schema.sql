-- Migration 026: Sales Agent V2 Schema (Email Replies, Proposal Drafting, Sales Metrics & Reports)

ALTER TABLE sales_prospects ADD COLUMN IF NOT EXISTS has_reply BOOLEAN DEFAULT FALSE;
ALTER TABLE sales_prospects ADD COLUMN IF NOT EXISTS last_reply_at TIMESTAMPTZ;
ALTER TABLE sales_prospects ADD COLUMN IF NOT EXISTS reply_content TEXT;
ALTER TABLE sales_prospects ADD COLUMN IF NOT EXISTS ai_reply_draft TEXT;
ALTER TABLE sales_prospects ADD COLUMN IF NOT EXISTS reply_status VARCHAR(50) DEFAULT 'NO_REPLY'; -- NO_REPLY, REPLY_RECEIVED, AI_REPLIED, NEEDS_HUMAN_REVIEW
ALTER TABLE sales_prospects ADD COLUMN IF NOT EXISTS proposal_details JSONB DEFAULT '{}'::jsonb;
ALTER TABLE sales_prospects ADD COLUMN IF NOT EXISTS proposal_status VARCHAR(50) DEFAULT 'NONE'; -- NONE, DRAFTED, SENT, SIGNED, REJECTED
ALTER TABLE sales_prospects ADD COLUMN IF NOT EXISTS deal_value NUMERIC(15, 2) DEFAULT 0.00;
ALTER TABLE sales_prospects ADD COLUMN IF NOT EXISTS sales_report JSONB DEFAULT '{}'::jsonb;

-- Create Index for performance
CREATE INDEX IF NOT EXISTS idx_sales_prospects_reply_status ON sales_prospects(reply_status);
CREATE INDEX IF NOT EXISTS idx_sales_prospects_proposal_status ON sales_prospects(proposal_status);
