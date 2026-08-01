const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');

// ── AES-256-GCM ENCRYPTION HELPER ──
const getAesKey = () => {
  const keyStr = process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  if (keyStr.length === 64) {
    return Buffer.from(keyStr, 'hex');
  }
  return Buffer.from(keyStr.padEnd(32, '\0').slice(0, 32));
};

const encryptPayload = (payload) => {
  const key = getAesKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = JSON.stringify(payload);
  const encrypted = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const ciphertextWithTag = Buffer.concat([encrypted, tag]);
  return `${iv.toString('hex')}:${ciphertextWithTag.toString('hex')}`;
};

// ── GET /api/mcp-gateway/registry ── List all registered global tools
router.get('/registry', authenticate, authorize('admin', 'employee'), async (req, res) => {
  try {
    const result = await query(
      `SELECT id, canonical_name, display_name, provider_type, is_high_risk, schema_json, created_at
       FROM tool_registry
       ORDER BY provider_type ASC, canonical_name ASC`
    );
    res.json({ registry: result.rows });
  } catch (error) {
    console.error('Error fetching tool registry:', error);
    res.status(500).json({ error: 'Failed to fetch tool registry.' });
  }
});

// ── POST /api/mcp-gateway/registry ── Add a new global tool schema (Admin only)
router.post('/registry', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { canonical_name, display_name, provider_type, is_high_risk, schema_json } = req.body;
    if (!canonical_name) {
      return res.status(400).json({ error: 'canonical_name is required.' });
    }

    const result = await query(
      `INSERT INTO tool_registry (canonical_name, display_name, provider_type, is_high_risk, schema_json)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (canonical_name) DO UPDATE SET
         display_name = EXCLUDED.display_name,
         provider_type = EXCLUDED.provider_type,
         is_high_risk = EXCLUDED.is_high_risk,
         schema_json = EXCLUDED.schema_json
       RETURNING *`,
      [
        canonical_name,
        display_name || canonical_name,
        provider_type || 'custom_http',
        is_high_risk || false,
        JSON.stringify(schema_json || {}),
      ]
    );

    res.status(201).json({ message: 'Tool registered successfully.', tool: result.rows[0] });
  } catch (error) {
    console.error('Error registering tool:', error);
    res.status(500).json({ error: 'Failed to register tool.' });
  }
});

// ── GET /api/mcp-gateway/bindings ── Get tenant tool bindings (optional ?agent_instance_id=...)
router.get('/bindings', authenticate, authorize('admin', 'employee', 'reviewer'), async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { agent_instance_id } = req.query;

    let sql = `
      SELECT tb.id, tb.agent_instance_id, tb.tenant_id, tb.tool_id, tb.tool_name, tb.connector_type,
             tb.is_enabled, tb.custom_risk_override, tb.config, tb.config_json, tb.created_at,
             tr.canonical_name, tr.display_name, tr.provider_type, tr.is_high_risk as registry_high_risk,
             tc.id as credential_id, tc.auth_type, tc.updated_at as credential_updated_at
      FROM tool_bindings tb
      LEFT JOIN tool_registry tr ON tb.tool_id = tr.id OR tb.tool_name = tr.canonical_name
      LEFT JOIN tool_credentials tc ON tb.id = tc.binding_id AND tc.tenant_id = $1
      WHERE tb.tenant_id = $1
    `;
    const params = [tenantId];

    if (agent_instance_id) {
      sql += ` AND tb.agent_instance_id = $2`;
      params.push(agent_instance_id);
    }
    sql += ` ORDER BY tb.created_at DESC`;

    const result = await query(sql, params, tenantId);
    res.json({ bindings: result.rows });
  } catch (error) {
    console.error('Error fetching tool bindings:', error);
    res.status(500).json({ error: 'Failed to fetch tool bindings.' });
  }
});

// ── POST /api/mcp-gateway/bindings ── Create or update a tenant tool binding
router.post('/bindings', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { tenantId } = req.user;
    const {
      agent_instance_id,
      tool_id,
      tool_name,
      connector_type,
      is_enabled,
      custom_risk_override,
      config_json,
    } = req.body;

    if (!agent_instance_id || (!tool_id && !tool_name)) {
      return res.status(400).json({ error: 'agent_instance_id and tool_id or tool_name are required.' });
    }

    // Resolve tool_name if only tool_id supplied
    let resolvedToolName = tool_name;
    let resolvedToolId = tool_id || null;

    if (tool_id && !resolvedToolName) {
      const reg = await query(`SELECT canonical_name FROM tool_registry WHERE id = $1`, [tool_id]);
      if (reg.rows.length > 0) {
        resolvedToolName = reg.rows[0].canonical_name;
      }
    }

    if (!resolvedToolId && resolvedToolName) {
      const reg = await query(`SELECT id FROM tool_registry WHERE canonical_name = $1`, [resolvedToolName]);
      if (reg.rows.length > 0) {
        resolvedToolId = reg.rows[0].id;
      }
    }

    const result = await query(
      `INSERT INTO tool_bindings 
        (agent_instance_id, tenant_id, tool_id, tool_name, connector_type, is_enabled, custom_risk_override, config_json, config)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
       ON CONFLICT (agent_instance_id, tool_name) DO UPDATE SET
         tool_id = EXCLUDED.tool_id,
         connector_type = EXCLUDED.connector_type,
         is_enabled = EXCLUDED.is_enabled,
         custom_risk_override = EXCLUDED.custom_risk_override,
         config_json = EXCLUDED.config_json,
         config = EXCLUDED.config
       RETURNING *`,
      [
        agent_instance_id,
        tenantId,
        resolvedToolId,
        resolvedToolName,
        connector_type || 'builtin',
        is_enabled !== undefined ? is_enabled : true,
        custom_risk_override !== undefined ? custom_risk_override : null,
        JSON.stringify(config_json || {}),
      ],
      tenantId
    );

    res.status(201).json({ message: 'Tool binding created/updated.', binding: result.rows[0] });
  } catch (error) {
    console.error('Error creating tool binding:', error);
    res.status(500).json({ error: 'Failed to create tool binding.' });
  }
});

// ── DELETE /api/mcp-gateway/bindings/:id ── Delete a tool binding
router.delete('/bindings/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { id: bindingId } = req.params;

    const result = await query(
      `DELETE FROM tool_bindings WHERE id = $1 AND tenant_id = $2 RETURNING id`,
      [bindingId, tenantId],
      tenantId
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Tool binding not found.' });
    }

    res.json({ message: 'Tool binding deleted successfully.' });
  } catch (error) {
    console.error('Error deleting tool binding:', error);
    res.status(500).json({ error: 'Failed to delete tool binding.' });
  }
});

// ── POST /api/mcp-gateway/credentials ── Encrypt & store tool API credentials
router.post('/credentials', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { binding_id, auth_type, payload } = req.body;

    if (!binding_id || !payload) {
      return res.status(400).json({ error: 'binding_id and payload object are required.' });
    }

    // Verify binding belongs to tenant
    const bindingCheck = await query(
      `SELECT id FROM tool_bindings WHERE id = $1 AND tenant_id = $2`,
      [binding_id, tenantId],
      tenantId
    );
    if (bindingCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Tool binding not found.' });
    }

    // Encrypt payload with AES-256-GCM
    const encryptedPayload = encryptPayload(payload);
    const authType = auth_type || 'api_key';

    const result = await query(
      `INSERT INTO tool_credentials (tenant_id, binding_id, auth_type, encrypted_payload, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (id) DO UPDATE SET
         auth_type = EXCLUDED.auth_type,
         encrypted_payload = EXCLUDED.encrypted_payload,
         updated_at = NOW()
       RETURNING id, binding_id, auth_type, updated_at`,
      [tenantId, binding_id, authType, encryptedPayload],
      tenantId
    );

    res.status(201).json({
      message: 'Credentials encrypted and stored successfully.',
      credential: result.rows[0],
    });
  } catch (error) {
    console.error('Error storing tool credentials:', error);
    res.status(500).json({ error: 'Failed to store credentials.' });
  }
});

module.exports = router;
