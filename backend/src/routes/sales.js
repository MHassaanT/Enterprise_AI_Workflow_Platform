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
      await query(`
        CREATE TABLE IF NOT EXISTS tenants (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(255) NOT NULL,
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);

      await query(`
        INSERT INTO tenants (id, name)
        VALUES ('00000000-0000-0000-0000-000000000000'::uuid, 'Default Platform Tenant')
        ON CONFLICT (id) DO NOTHING;
      `);

      if (tenantId && tenantId !== '00000000-0000-0000-0000-000000000000') {
        await query(`
          INSERT INTO tenants (id, name)
          VALUES ($1::uuid, 'Enterprise Tenant')
          ON CONFLICT (id) DO NOTHING;
        `, [tenantId], tenantId);
      }

      await query(`
        CREATE TABLE IF NOT EXISTS sales_prospects (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          company_name VARCHAR(255) NOT NULL,
          domain VARCHAR(255) NOT NULL,
          contact_name VARCHAR(255),
          contact_email VARCHAR(255),
          contact_title VARCHAR(255),
          icp_score NUMERIC(5, 2) DEFAULT 0.00,
          deliverability_status VARCHAR(50) DEFAULT 'UNVERIFIED',
          scraped_context TEXT,
          outreach_subject VARCHAR(500),
          outreach_body TEXT,
          deal_stage VARCHAR(50) DEFAULT 'DISCOVERED',
          quote_details JSONB DEFAULT '{}'::jsonb,
          apollo_person_id VARCHAR(100),
          gmail_message_id VARCHAR(100),
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);

      const result = await query(
        "SELECT * FROM sales_prospects WHERE tenant_id = $1 OR tenant_id = '00000000-0000-0000-0000-000000000000' ORDER BY created_at DESC;",
        [tenantId],
        tenantId
      );
      prospects = result.rows;
    } catch (e) {
      console.error('Error querying sales_prospects:', e);
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
    const { target_domain, prospect_limit, icp_config, auto_send_email } = req.body;

    const response = await axios.post(
      `${AGENT_URL}/agent/sales/run`,
      {
        tenant_id: tenantId,
        target_domain: target_domain || null,
        prospect_limit: parseInt(prospect_limit) || 10,
        auto_send_email: auto_send_email || false,
        icp_config: icp_config || null,
        user_id: req.user?.id || 'sales_user'
      },
      {
        headers: { 'X-Internal-Token': INTERNAL_TOKEN },
        timeout: 120000,
      }
    );

    return res.json({ success: true, result: response.data });
  } catch (err) {
    console.error('Error executing Sales SDR agent:', err.message);
    return res.status(500).json({ error: 'Sales SDR Agent execution failed.' });
  }
});

// POST /api/v1/sales/send-email — Manually send single outreach email via Gmail API
router.post('/send-email', async (req, res) => {
  try {
    const tenantId = req.user?.tenant_id || req.headers['x-tenant-id'] || req.body.tenant_id || '00000000-0000-0000-0000-000000000000';
    const { prospect_id, contact_email, subject, body } = req.body;

    const response = await axios.post(
      `${AGENT_URL}/agent/sales/send-email`,
      {
        tenant_id: tenantId,
        prospect_id,
        contact_email,
        subject,
        body,
      },
      {
        headers: { 'X-Internal-Token': INTERNAL_TOKEN },
      }
    );

    return res.json(response.data);
  } catch (err) {
    console.error('Error dispatching email:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to send outreach email.' });
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
