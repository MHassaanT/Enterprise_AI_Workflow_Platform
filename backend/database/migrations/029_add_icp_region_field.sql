-- Migration 029: Add region field to sales_icp_configs
-- Extends ICP configuration to support geographic targeting in the search discovery pipeline.

ALTER TABLE sales_icp_configs
  ADD COLUMN IF NOT EXISTS region TEXT DEFAULT '';
