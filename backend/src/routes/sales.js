const express = require('express');
const router = express.Router();
const { query } = require('../db');
const axios = require('axios');

const AGENT_URL = process.env.AGENT_URL || 'http://localhost:8000';
const INTERNAL_TOKEN = process.env.INTERNAL_SERVICE_TOKEN || 'internal_secret_change_in_production';

// GET /api/v1/sales/leads — Fetch CRM leads
router.get('/leads', async (req, res) => {
  try {
    const tenantId = req.user?.tenant_id || req.headers['x-tenant-id'];
    const result = await query(
      'SELECT * FROM crm_leads WHERE tenant_id = $1 ORDER BY created_at DESC;',
      [tenantId],
      tenantId
    );
    return res.json({ success: true, leads: result.rows });
  } catch (err) {
    console.error('Error fetching CRM leads:', err);
    return res.status(500).json({ error: 'Failed to fetch leads.' });
  }
});

// POST /api/v1/sales/request-quote — Ingest pricing request & draft quote
router.post('/request-quote', async (req, res) => {
  try {
    const tenantId = req.user?.tenant_id || req.headers['x-tenant-id'] || req.body.tenant_id;
    const { customer_email, tier_requested, requested_discount } = req.body;

    const response = await axios.post(
      `${AGENT_URL}/agent/sales/run`,
      {
        tenant_id: tenantId,
        conversation_id: `sales-${Date.now()}`,
        subagent_target: 'lead_pricing',
        customer_email,
        tier_requested: tier_requested || 'Enterprise',
        requested_discount: requested_discount || 10.0,
      },
      {
        headers: { 'X-Internal-Token': INTERNAL_TOKEN },
      }
    );

    return res.json({ success: true, result: response.data });
  } catch (err) {
    console.error('Error executing sales agent:', err.message);
    return res.status(500).json({ error: 'Sales Agent execution failed.' });
  }
});

module.exports = router;
