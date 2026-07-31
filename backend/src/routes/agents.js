const express = require('express');
const router = express.Router();
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');

// ── GET /api/agents (or /api/v1/agents) ── returns all active agent instances for the tenant
router.get('/', authenticate, authorize('admin', 'employee', 'reviewer'), async (req, res) => {
  try {
    const { tenantId } = req.user;
    const result = await query(
      `SELECT id, name, config, is_active, created_at
       FROM agent_instances
       WHERE tenant_id = $1 AND is_active = true
       ORDER BY created_at ASC`,
      [tenantId],
      tenantId
    );
    res.json({ agents: result.rows });
  } catch (error) {
    console.error('Error fetching agents:', error);
    res.status(500).json({ error: 'Failed to fetch agent instances.' });
  }
});

// ── GET /api/agents/:id/config (or /api/v1/agents/:id/config) ──
router.get('/:id/config', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { id: agentId } = req.params;

    const agentResult = await query(
      `SELECT id, name, config, is_active FROM agent_instances WHERE id = $1 AND tenant_id = $2`,
      [agentId, tenantId],
      tenantId
    );

    if (agentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Agent instance not found.' });
    }

    const bindingsResult = await query(
      `SELECT tb.id, tb.tool_name, tb.connector_type, tb.mcp_server_id, tb.config, tb.is_high_risk, ms.name as mcp_server_name
       FROM tool_bindings tb
       LEFT JOIN mcp_servers ms ON tb.mcp_server_id = ms.id
       WHERE tb.agent_instance_id = $1 AND tb.tenant_id = $2`,
      [agentId, tenantId],
      tenantId
    );

    res.json({
      agent: agentResult.rows[0],
      tool_bindings: bindingsResult.rows,
    });
  } catch (error) {
    console.error('Error fetching agent config:', error);
    res.status(500).json({ error: 'Failed to fetch agent configuration.' });
  }
});

// ── POST /api/agents/:id/config (or /api/v1/agents/:id/config) ──
// Admin runtime endpoint to update an agent's bound tools and approval policy
router.post('/:id/config', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { id: agentId } = req.params;
    const { tool_bindings, human_approval_policy, config } = req.body;

    // 1. Verify agent exists under this tenant
    const agentResult = await query(
      `SELECT id, config FROM agent_instances WHERE id = $1 AND tenant_id = $2`,
      [agentId, tenantId],
      tenantId
    );

    if (agentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Agent instance not found.' });
    }

    // 2. Update agent instance config column
    const currentConfig = agentResult.rows[0].config || {};
    const updatedConfig = {
      ...currentConfig,
      ...(config || {}),
      ...(human_approval_policy ? { human_approval_policy } : {}),
      updated_at: new Date().toISOString(),
    };

    await query(
      `UPDATE agent_instances SET config = $1 WHERE id = $2 AND tenant_id = $3`,
      [JSON.stringify(updatedConfig), agentId, tenantId],
      tenantId
    );

    // 3. Upsert / synchronize tool_bindings if provided
    if (Array.isArray(tool_bindings)) {
      // Clear existing bindings for this agent to reset allowlist cleanly
      await query(
        `DELETE FROM tool_bindings WHERE agent_instance_id = $1 AND tenant_id = $2`,
        [agentId, tenantId],
        tenantId
      );

      for (const binding of tool_bindings) {
        await query(
          `INSERT INTO tool_bindings 
            (agent_instance_id, tenant_id, tool_name, connector_type, mcp_server_id, config, is_high_risk)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            agentId,
            tenantId,
            binding.tool_name,
            binding.connector_type || 'builtin',
            binding.mcp_server_id || null,
            JSON.stringify(binding.config || {}),
            binding.is_high_risk || false,
          ],
          tenantId
        );
      }
    }

    // Fetch updated bindings to return in response
    const finalBindings = await query(
      `SELECT id, tool_name, connector_type, mcp_server_id, config, is_high_risk
       FROM tool_bindings WHERE agent_instance_id = $1 AND tenant_id = $2`,
      [agentId, tenantId],
      tenantId
    );

    res.json({
      message: 'Agent configuration updated successfully.',
      agent_id: agentId,
      config: updatedConfig,
      tool_bindings: finalBindings.rows,
    });
  } catch (error) {
    console.error('Error updating agent config:', error);
    res.status(500).json({ error: 'Failed to update agent configuration.' });
  }
});

module.exports = router;
