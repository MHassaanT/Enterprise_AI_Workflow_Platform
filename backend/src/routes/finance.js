const express = require('express');
const router = express.Router();
const { query } = require('../db');
const axios = require('axios');
const { authenticate } = require('../middleware/auth');

const AGENT_URL = process.env.AGENT_SERVICE_URL || process.env.AGENT_URL || 'http://localhost:8000';
const INTERNAL_TOKEN = process.env.INTERNAL_SERVICE_TOKEN || 'internal_secret_change_in_production';

router.use(authenticate);

// GET /api/v1/finance/invoices — Fetch all invoices
router.get('/invoices', async (req, res) => {
  try {
    const tenantId = req.user?.tenantId || req.user?.tenant_id || req.headers['x-tenant-id'];
    const result = await query(
      'SELECT * FROM invoices WHERE tenant_id = $1 ORDER BY created_at DESC;',
      [tenantId],
      tenantId
    );
    return res.json({ success: true, invoices: result.rows });
  } catch (err) {
    console.error('Error fetching invoices:', err);
    return res.status(500).json({ error: 'Failed to fetch invoices.' });
  }
});

// GET /api/v1/finance/ledger — Fetch General Ledger
router.get('/ledger', async (req, res) => {
  try {
    const tenantId = req.user?.tenantId || req.user?.tenant_id || req.headers['x-tenant-id'];
    const result = await query(
      'SELECT * FROM general_ledger WHERE tenant_id = $1 ORDER BY created_at DESC;',
      [tenantId],
      tenantId
    );
    return res.json({ success: true, ledger: result.rows });
  } catch (err) {
    console.error('Error fetching ledger:', err);
    return res.status(500).json({ error: 'Failed to fetch ledger.' });
  }
});

// GET /api/v1/finance/budgets — Fetch Department Budgets
router.get('/budgets', async (req, res) => {
  try {
    const tenantId = req.user?.tenantId || req.user?.tenant_id || req.headers['x-tenant-id'];
    const result = await query(
      'SELECT * FROM department_budgets WHERE tenant_id = $1;',
      [tenantId],
      tenantId
    );
    return res.json({ success: true, budgets: result.rows });
  } catch (err) {
    console.error('Error fetching budgets:', err);
    return res.status(500).json({ error: 'Failed to fetch budgets.' });
  }
});

// POST /api/v1/finance/process-invoice — Run Invoice Ingestion & Reconciliation Sub-Agent
router.post('/process-invoice', async (req, res) => {
  try {
    const tenantId = req.user?.tenantId || req.user?.tenant_id || req.headers['x-tenant-id'] || req.body.tenant_id;
    const { invoice_data } = req.body;

    const response = await axios.post(
      `${AGENT_URL}/agent/finance/run`,
      {
        tenant_id: tenantId,
        conversation_id: `inv-${Date.now()}`,
        subagent_target: 'invoice_ingestion',
        invoice_data,
      },
      {
        headers: { 'X-Internal-Token': INTERNAL_TOKEN },
      }
    );

    return res.json({ success: true, result: response.data });
  } catch (err) {
    console.error('Error executing finance agent:', err.message);
    return res.status(500).json({ error: 'Finance Agent execution failed.' });
  }
});

module.exports = router;
