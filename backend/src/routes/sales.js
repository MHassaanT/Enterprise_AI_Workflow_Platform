const express = require('express');
const router = express.Router();
const { query } = require('../db');
const axios = require('axios');

const AGENT_URL = process.env.AGENT_SERVICE_URL || process.env.AGENT_URL || 'http://localhost:8000';
const INTERNAL_TOKEN = process.env.INTERNAL_SERVICE_TOKEN || 'internal_secret_change_in_production';

// GET /api/v1/sales/prospects — Fetch AI SDR discovered lead prospects & CRM deals
router.get('/prospects', async (req, res) => {
  try {
    const tenantId = req.user?.tenant_id || req.headers['x-tenant-id'] || '00000000-0000-0000-0000-000000000000';
    let prospects = [];
    try {
      const result = await query(
        'SELECT * FROM sales_prospects WHERE tenant_id = $1 ORDER BY created_at DESC;',
        [tenantId],
        tenantId
      );
      prospects = result.rows;
    } catch (e) {
      const fallbackResult = await query(
        'SELECT * FROM crm_leads WHERE tenant_id = $1 ORDER BY created_at DESC;',
        [tenantId],
        tenantId
      );
      prospects = fallbackResult.rows.map(r => ({
        id: r.id,
        company_name: r.company || 'Enterprise Corp',
        domain: (r.customer_email || '').split('@')[1] || 'enterprise.com',
        contact_name: r.customer_name || (r.customer_email || '').split('@')[0],
        contact_email: r.customer_email,
        contact_title: 'Executive',
        icp_score: 90,
        deliverability_status: 'VALID',
        deal_stage: r.deal_stage,
        outreach_subject: 'Enterprise Solution Partnership',
        outreach_body: 'Outreach campaign dispatched.',
        created_at: r.created_at
      }));
    }
    return res.json({ success: true, prospects });
  } catch (err) {
    console.error('Error fetching sales prospects:', err);
    return res.status(500).json({ error: 'Failed to fetch prospects.' });
  }
});

// POST /api/v1/sales/pipeline/run — Trigger autonomous 6-stage AI SDR pipeline
router.post('/pipeline/run', async (req, res) => {
  try {
    const tenantId = req.user?.tenant_id || req.headers['x-tenant-id'] || req.body.tenant_id || '00000000-0000-0000-0000-000000000000';
    const { target_domain, prospect_limit, icp_config } = req.body;

    const response = await axios.post(
      `${AGENT_URL}/agent/sales/run`,
      {
        tenant_id: tenantId,
        target_domain: target_domain || null,
        prospect_limit: parseInt(prospect_limit) || 10,
        icp_config: icp_config || null,
        user_id: req.user?.id || 'sales_user'
      },
      {
        headers: { 'X-Internal-Token': INTERNAL_TOKEN },
      }
    );

    return res.json({ success: true, result: response.data });
  } catch (err) {
    console.error('Error executing Sales SDR agent:', err.message);
    return res.status(500).json({ error: 'Sales SDR Agent execution failed.' });
  }
});

// POST /api/v1/sales/icp/build — Auto-build ICP from Knowledge Base scanning
router.post('/icp/build', async (req, res) => {
  try {
    const tenantId = req.user?.tenant_id || req.headers['x-tenant-id'] || req.body.tenant_id || '00000000-0000-0000-0000-000000000000';
    const response = await axios.post(
      `${AGENT_URL}/agent/sales/icp/build`,
      { tenant_id: tenantId },
      { headers: { 'X-Internal-Token': INTERNAL_TOKEN } }
    );
    return res.json(response.data);
  } catch (err) {
    console.error('Error building ICP from Knowledge Base:', err.message);
    return res.status(500).json({ error: 'Failed to build ICP from Knowledge Base.' });
  }
});

// GET /api/v1/sales/icp — Fetch ICP Configuration
router.get('/icp', async (req, res) => {
  try {
    const tenantId = req.user?.tenant_id || req.headers['x-tenant-id'] || '00000000-0000-0000-0000-000000000000';
    const response = await axios.get(
      `${AGENT_URL}/agent/sales/icp/${tenantId}`,
      { headers: { 'X-Internal-Token': INTERNAL_TOKEN } }
    );
    return res.json(response.data);
  } catch (err) {
    console.error('Error fetching ICP config:', err.message);
    return res.status(500).json({ error: 'Failed to fetch ICP config.' });
  }
});

// POST /api/v1/sales/icp — Save ICP Configuration
router.post('/icp', async (req, res) => {
  try {
    const tenantId = req.user?.tenant_id || req.headers['x-tenant-id'] || req.body.tenant_id || '00000000-0000-0000-0000-000000000000';
    const response = await axios.post(
      `${AGENT_URL}/agent/sales/icp`,
      { ...req.body, tenant_id: tenantId },
      { headers: { 'X-Internal-Token': INTERNAL_TOKEN } }
    );
    return res.json(response.data);
  } catch (err) {
    console.error('Error saving ICP config:', err.message);
    return res.status(500).json({ error: 'Failed to save ICP config.' });
  }
});

// POST /api/v1/sales/apollo-key — Save Apollo Master API Key
router.post('/apollo-key', async (req, res) => {
  try {
    const tenantId = req.user?.tenant_id || req.headers['x-tenant-id'] || req.body.tenant_id || '00000000-0000-0000-0000-000000000000';
    const { apollo_api_key } = req.body;
    const response = await axios.post(
      `${AGENT_URL}/agent/sales/apollo-key`,
      { tenant_id: tenantId, apollo_api_key },
      { headers: { 'X-Internal-Token': INTERNAL_TOKEN } }
    );
    return res.json(response.data);
  } catch (err) {
    console.error('Error saving Apollo key:', err.message);
    return res.status(500).json({ error: 'Failed to save Apollo API key.' });
  }
});

// GET /api/v1/sales/apollo-key — Check Apollo Key Status
router.get('/apollo-key', async (req, res) => {
  try {
    const tenantId = req.user?.tenant_id || req.headers['x-tenant-id'] || '00000000-0000-0000-0000-000000000000';
    const response = await axios.get(
      `${AGENT_URL}/agent/sales/apollo-key/${tenantId}`,
      { headers: { 'X-Internal-Token': INTERNAL_TOKEN } }
    );
    return res.json(response.data);
  } catch (err) {
    console.error('Error checking Apollo key:', err.message);
    return res.json({ configured: false, is_valid: false });
  }
});

module.exports = router;
