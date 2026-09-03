const express = require('express');
const router = express.Router();
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');

// ── GET /api/entities ──
// List all entities with fields and operations for the current tenant
router.get('/', authenticate, async (req, res) => {
  const { tenantId } = req.user;
  try {
    const result = await query(
      `SELECT e.*, 
        COALESCE((SELECT json_agg(json_build_object(
          'id', f.id, 'field_name', f.field_name, 'display_name', f.display_name, 'field_type', f.field_type,
          'is_required', f.is_required, 'is_searchable', f.is_searchable, 'is_filterable', f.is_filterable,
          'enum_values', f.enum_values, 'description', f.description
        ) ORDER BY f.created_at) FROM tenant_entity_fields f WHERE f.entity_id = e.id), '[]'::json) as fields,
        COALESCE((SELECT json_agg(json_build_object(
          'id', o.id, 'operation_name', o.operation_name, 'is_enabled', o.is_enabled, 'requires_approval', o.requires_approval
        ) ORDER BY o.created_at) FROM tenant_entity_operations o WHERE o.entity_id = e.id), '[]'::json) as operations
       FROM tenant_entities e WHERE e.tenant_id = $1 ORDER BY e.created_at DESC`,
      [tenantId], tenantId
    );
    res.json({ entities: result.rows });
  } catch (error) {
    console.error('Error fetching entities:', error);
    res.status(500).json({ error: 'Failed to fetch entities.' });
  }
});

// ── POST /api/entities ──
// Create a new entity definition (admin only)
router.post('/', authenticate, authorize('admin'), async (req, res) => {
  const { tenantId } = req.user;
  const { entity_name, display_name, description, icon, data_source_type, data_source_config } = req.body;
  if (!entity_name || !display_name) {
    return res.status(400).json({ error: 'entity_name and display_name required.' });
  }
  try {
    const result = await query(
      `INSERT INTO tenant_entities (tenant_id, entity_name, display_name, description, icon, data_source_type, data_source_config)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [tenantId, entity_name, display_name, description || '', icon || 'box', data_source_type || 'internal_api', JSON.stringify(data_source_config || {})],
      tenantId
    );
    res.status(201).json({ entity: result.rows[0] });
  } catch (error) {
    console.error('Error creating entity:', error);
    if (error.code === '23505') {
      return res.status(409).json({ error: `Entity '${entity_name}' already exists for this tenant.` });
    }
    res.status(500).json({ error: 'Failed to create entity.' });
  }
});

// ── PUT /api/entities/:entityId ──
// Update an entity definition (admin only)
router.put('/:entityId', authenticate, authorize('admin'), async (req, res) => {
  const { tenantId } = req.user;
  const { entityId } = req.params;
  const { display_name, description, icon, data_source_type, data_source_config, is_enabled } = req.body;
  try {
    const result = await query(
      `UPDATE tenant_entities SET 
        display_name = COALESCE($1, display_name),
        description = COALESCE($2, description),
        icon = COALESCE($3, icon),
        data_source_type = COALESCE($4, data_source_type),
        data_source_config = COALESCE($5, data_source_config),
        is_enabled = COALESCE($6, is_enabled),
        updated_at = NOW()
       WHERE id = $7 AND tenant_id = $8 RETURNING *`,
      [display_name, description, icon, data_source_type, data_source_config ? JSON.stringify(data_source_config) : null, is_enabled, entityId, tenantId],
      tenantId
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Entity not found.' });
    res.json({ entity: result.rows[0] });
  } catch (error) {
    console.error('Error updating entity:', error);
    res.status(500).json({ error: 'Failed to update entity.' });
  }
});

// ── DELETE /api/entities/:entityId ──
// Delete an entity definition (admin only)
router.delete('/:entityId', authenticate, authorize('admin'), async (req, res) => {
  const { tenantId } = req.user;
  const { entityId } = req.params;
  try {
    const result = await query(
      `DELETE FROM tenant_entities WHERE id = $1 AND tenant_id = $2 RETURNING id`,
      [entityId, tenantId], tenantId
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Entity not found.' });
    res.json({ deleted: true });
  } catch (error) {
    console.error('Error deleting entity:', error);
    res.status(500).json({ error: 'Failed to delete entity.' });
  }
});

// ── POST /api/entities/:entityId/fields ──
// Add field to entity (admin only)
router.post('/:entityId/fields', authenticate, authorize('admin'), async (req, res) => {
  const { tenantId } = req.user;
  const { entityId } = req.params;
  const { field_name, display_name, field_type, is_required, is_searchable, is_filterable, enum_values, description } = req.body;

  if (!field_name || !display_name || !field_type) {
    return res.status(400).json({ error: 'field_name, display_name, and field_type required.' });
  }

  try {
    const entityCheck = await query(
      `SELECT id FROM tenant_entities WHERE id = $1 AND tenant_id = $2`,
      [entityId, tenantId], tenantId
    );
    if (!entityCheck.rows[0]) return res.status(404).json({ error: 'Entity not found.' });

    const result = await query(
      `INSERT INTO tenant_entity_fields (entity_id, field_name, display_name, field_type, is_required, is_searchable, is_filterable, enum_values, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [entityId, field_name, display_name, field_type, is_required || false, is_searchable !== false, is_filterable !== false, enum_values ? JSON.stringify(enum_values) : null, description || ''],
      tenantId
    );
    res.status(201).json({ field: result.rows[0] });
  } catch (error) {
    console.error('Error adding field:', error);
    if (error.code === '23505') {
      return res.status(409).json({ error: `Field '${field_name}' already exists for this entity.` });
    }
    res.status(500).json({ error: 'Failed to add field.' });
  }
});

// ── DELETE /api/entities/:entityId/fields/:fieldId ──
// Remove a field (admin only)
router.delete('/:entityId/fields/:fieldId', authenticate, authorize('admin'), async (req, res) => {
  const { tenantId } = req.user;
  const { entityId, fieldId } = req.params;
  try {
    const entityCheck = await query(
      `SELECT id FROM tenant_entities WHERE id = $1 AND tenant_id = $2`,
      [entityId, tenantId], tenantId
    );
    if (!entityCheck.rows[0]) return res.status(404).json({ error: 'Entity not found.' });
    const result = await query(`DELETE FROM tenant_entity_fields WHERE id = $1 AND entity_id = $2 RETURNING id`, [fieldId, entityId]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Field not found.' });
    res.json({ deleted: true });
  } catch (error) {
    console.error('Error deleting field:', error);
    res.status(500).json({ error: 'Failed to delete field.' });
  }
});

// ── POST /api/entities/:entityId/operations ──
// Add operation to entity (admin only)
router.post('/:entityId/operations', authenticate, authorize('admin'), async (req, res) => {
  const { tenantId } = req.user;
  const { entityId } = req.params;
  const { operation_name, requires_approval } = req.body;

  if (!operation_name) {
    return res.status(400).json({ error: 'operation_name required.' });
  }

  try {
    const entityCheck = await query(
      `SELECT id FROM tenant_entities WHERE id = $1 AND tenant_id = $2`,
      [entityId, tenantId], tenantId
    );
    if (!entityCheck.rows[0]) return res.status(404).json({ error: 'Entity not found.' });

    const result = await query(
      `INSERT INTO tenant_entity_operations (entity_id, operation_name, requires_approval) VALUES ($1, $2, $3) RETURNING *`,
      [entityId, operation_name, requires_approval || false], tenantId
    );
    res.status(201).json({ operation: result.rows[0] });
  } catch (error) {
    console.error('Error adding operation:', error);
    if (error.code === '23505') {
      return res.status(409).json({ error: `Operation '${operation_name}' already exists for this entity.` });
    }
    res.status(500).json({ error: 'Failed to add operation.' });
  }
});

// ── DELETE /api/entities/:entityId/operations/:operationId ──
// Remove an operation (admin only)
router.delete('/:entityId/operations/:operationId', authenticate, authorize('admin'), async (req, res) => {
  const { tenantId } = req.user;
  const { entityId, operationId } = req.params;
  try {
    const entityCheck = await query(
      `SELECT id FROM tenant_entities WHERE id = $1 AND tenant_id = $2`,
      [entityId, tenantId], tenantId
    );
    if (!entityCheck.rows[0]) return res.status(404).json({ error: 'Entity not found.' });
    const result = await query(`DELETE FROM tenant_entity_operations WHERE id = $1 AND entity_id = $2 RETURNING id`, [operationId, entityId]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Operation not found.' });
    res.json({ deleted: true });
  } catch (error) {
    console.error('Error deleting operation:', error);
    res.status(500).json({ error: 'Failed to delete operation.' });
  }
});

// ── GET /api/entities/agent-context ──
// Get agent context config
router.get('/agent-context', authenticate, async (req, res) => {
  const { tenantId } = req.user;
  try {
    const result = await query(
      `SELECT * FROM tenant_agent_context WHERE tenant_id = $1 AND agent_type = 'customer_support'`,
      [tenantId], tenantId
    );
    res.json({ context: result.rows[0] || null });
  } catch (error) {
    console.error('Error fetching agent context:', error);
    res.status(500).json({ error: 'Failed to fetch agent context.' });
  }
});

// ── PUT /api/entities/agent-context ──
// Update agent context config (admin only)
router.put('/agent-context', authenticate, authorize('admin'), async (req, res) => {
  const { tenantId } = req.user;
  const { company_name, company_description, support_tone, auto_escalate_keywords, auto_escalate_after_attempts, max_tool_calls_per_turn, enable_proactive_suggestions, custom_system_instructions } = req.body;
  try {
    const result = await query(
      `INSERT INTO tenant_agent_context (tenant_id, agent_type, company_name, company_description, support_tone, auto_escalate_keywords, auto_escalate_after_attempts, max_tool_calls_per_turn, enable_proactive_suggestions, custom_system_instructions, updated_at)
       VALUES ($1, 'customer_support', $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       ON CONFLICT (tenant_id, agent_type) DO UPDATE SET
         company_name = EXCLUDED.company_name, company_description = EXCLUDED.company_description,
         support_tone = EXCLUDED.support_tone, auto_escalate_keywords = EXCLUDED.auto_escalate_keywords,
         auto_escalate_after_attempts = EXCLUDED.auto_escalate_after_attempts,
         max_tool_calls_per_turn = EXCLUDED.max_tool_calls_per_turn,
         enable_proactive_suggestions = EXCLUDED.enable_proactive_suggestions,
         custom_system_instructions = EXCLUDED.custom_system_instructions, updated_at = NOW()
       RETURNING *`,
      [tenantId, company_name, company_description, support_tone || 'professional', auto_escalate_keywords ? JSON.stringify(auto_escalate_keywords) : '[]', auto_escalate_after_attempts || 3, max_tool_calls_per_turn || 5, enable_proactive_suggestions !== false, custom_system_instructions || ''],
      tenantId
    );
    res.json({ context: result.rows[0] });
  } catch (error) {
    console.error('Error updating agent context:', error);
    res.status(500).json({ error: 'Failed to update agent context.' });
  }
});

module.exports = router;
