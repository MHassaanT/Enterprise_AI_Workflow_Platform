-- 016_polling_state.sql
-- Table to store high-water marks for integration polling

CREATE TABLE IF NOT EXISTS workflow_polling_state (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID NOT NULL REFERENCES workflows(workflow_id) ON DELETE CASCADE,
    integration_name VARCHAR(255) NOT NULL,
    last_processed_ids JSONB DEFAULT '[]'::jsonb,
    last_checked_timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(workflow_id, integration_name)
);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION trigger_set_timestamp_polling_state()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_timestamp_polling_state ON workflow_polling_state;
CREATE TRIGGER set_timestamp_polling_state
BEFORE UPDATE ON workflow_polling_state
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp_polling_state();
