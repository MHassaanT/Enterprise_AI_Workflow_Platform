const express = require('express');
const router = express.Router();
const { query } = require('../db');
const axios = require('axios');

const AGENT_URL = process.env.AGENT_URL || 'http://localhost:8000';
const INTERNAL_TOKEN = process.env.INTERNAL_SERVICE_TOKEN || 'internal_secret_change_in_production';

// GET /api/v1/procurement/bids — Fetch vendor bids
router.get('/bids', async (req, res) => {
  try {
    const tenantId = req.user?.tenant_id || req.headers['x-tenant-id'];
    const result = await query(
      'SELECT * FROM procurement_bids WHERE tenant_id = $1 ORDER BY created_at DESC;',
      [tenantId],
      tenantId
    );
    return res.json({ success: true, bids: result.rows });
  } catch (err) {
    console.error('Error fetching procurement bids:', err);
    return res.status(500).json({ error: 'Failed to fetch bids.' });
  }
});

// GET /api/v1/procurement/purchase-orders — Fetch POs
router.get('/purchase-orders', async (req, res) => {
  try {
    const tenantId = req.user?.tenant_id || req.headers['x-tenant-id'];
    const result = await query(
      'SELECT * FROM purchase_orders WHERE tenant_id = $1 ORDER BY created_at DESC;',
      [tenantId],
      tenantId
    );
    return res.json({ success: true, purchase_orders: result.rows });
  } catch (err) {
    console.error('Error fetching POs:', err);
    return res.status(500).json({ error: 'Failed to fetch POs.' });
  }
});

// POST /api/v1/procurement/submit-bid — Ingest vendor bid & run compliance + budget check
router.post('/submit-bid', async (req, res) => {
  try {
    const tenantId = req.user?.tenant_id || req.headers['x-tenant-id'] || req.body.tenant_id;
    const { bid_data, department } = req.body;

    const response = await axios.post(
      `${AGENT_URL}/agent/procurement/run`,
      {
        tenant_id: tenantId,
        conversation_id: `bid-${Date.now()}`,
        subagent_target: 'vendor_bid',
        bid_data,
        department: department || 'Engineering',
      },
      {
        headers: { 'X-Internal-Token': INTERNAL_TOKEN },
      }
    );

    return res.json({ success: true, result: response.data });
  } catch (err) {
    console.error('Error executing procurement agent:', err.message);
    return res.status(500).json({ error: 'Procurement Agent execution failed.' });
  }
});

module.exports = router;
