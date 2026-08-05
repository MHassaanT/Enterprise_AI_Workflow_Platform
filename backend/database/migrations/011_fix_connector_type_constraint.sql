-- Migration: 011_fix_connector_type_constraint.sql
-- Fix: The original CHECK constraint only allowed 'builtin', 'mcp_sse', 'mcp_http', 'mcp_stdio'.
-- This silently rejected all vendor connector types (github, airtable, stripe, etc.),
-- causing tool binding saves from the Integration Hub to fail after deleting existing bindings.

ALTER TABLE tool_bindings DROP CONSTRAINT IF EXISTS tool_bindings_connector_type_check;

ALTER TABLE tool_bindings ADD CONSTRAINT tool_bindings_connector_type_check
  CHECK (connector_type IN (
    'builtin',
    'mcp_sse', 'mcp_http', 'mcp_stdio',
    'github', 'vercel',
    'safepay', 'supabase', 'stripe',
    'airtable', 'hubspot', 'clickup',
    'resend', 'custom_http'
  ));
