const express = require('express');
const router = express.Router();
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');

// ── GET /api/mcp ── List registered MCP servers for tenant
router.get('/', authenticate, authorize('admin', 'employee'), async (req, res) => {
  try {
    const { tenantId } = req.user;
    const result = await query(
      `SELECT id, name, transport_type, endpoint_url, auth_headers, is_active, created_at
       FROM mcp_servers
       WHERE tenant_id = $1
       ORDER BY created_at DESC`,
      [tenantId],
      tenantId
    );
    res.json({ mcp_servers: result.rows });
  } catch (error) {
    console.error('Error fetching MCP servers:', error);
    res.status(500).json({ error: 'Failed to fetch MCP servers.' });
  }
});

// ── POST /api/mcp ── Register a new MCP server connection
router.post('/', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { name, transport_type, endpoint_url, auth_headers } = req.body;

    if (!name || !endpoint_url) {
      return res.status(400).json({ error: 'name and endpoint_url are required.' });
    }

    const transport = transport_type || 'http';
    const headersJson = JSON.stringify(auth_headers || {});

    const result = await query(
      `INSERT INTO mcp_servers (tenant_id, name, transport_type, endpoint_url, auth_headers)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, transport_type, endpoint_url, auth_headers, is_active, created_at`,
      [tenantId, name, transport, endpoint_url, headersJson],
      tenantId
    );

    res.status(201).json({
      message: 'MCP server registered successfully.',
      mcp_server: result.rows[0],
    });
  } catch (error) {
    console.error('Error registering MCP server:', error);
    res.status(500).json({ error: 'Failed to register MCP server.' });
  }
});

// ── DELETE /api/mcp/:id ── Disconnect an MCP server
router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { id: mcpId } = req.params;

    const result = await query(
      `DELETE FROM mcp_servers WHERE id = $1 AND tenant_id = $2 RETURNING id`,
      [mcpId, tenantId],
      tenantId
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'MCP server connection not found.' });
    }

    res.json({ message: 'MCP server connection deleted successfully.' });
  } catch (error) {
    console.error('Error deleting MCP server:', error);
    res.status(500).json({ error: 'Failed to delete MCP server connection.' });
  }
});

module.exports = router;
