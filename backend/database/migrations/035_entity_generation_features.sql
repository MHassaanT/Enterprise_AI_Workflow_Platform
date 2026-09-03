-- Migration: 035_entity_generation_features.sql
-- Description: Adds a status column to tenant_entities to support draft generation via AI

ALTER TABLE tenant_entities 
ADD COLUMN status VARCHAR(20) DEFAULT 'active' 
CHECK (status IN ('draft', 'active'));

-- Update existing records to active
UPDATE tenant_entities SET status = 'active' WHERE status IS NULL;

SELECT 'Migration 035 completed successfully' AS migration_status;
