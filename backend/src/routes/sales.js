const express = require('express');
const router = express.Router();
const { query } = require('../db');
const axios = require('axios');
const { authenticate } = require('../middleware/auth');

const AGENT_URL = process.env.AGENT_SERVICE_URL || process.env.AGENT_URL || 'http://localhost:8000';
const INTERNAL_TOKEN = process.env.INTERNAL_SERVICE_TOKEN || 'internal_secret_change_in_production';

router.use(authenticate);

// GET /api/v1/sales/prospects — Fetch AI SDR discovered lead prospects & CRM deals
router.get('/prospects', async (req, res) => {
  try {
    const tenantId = req.user?.tenantId || req.user?.tenant_id || req.headers['x-tenant-id'];
    if (!tenantId) {
      return res.status(401).json({ error: 'Tenant context missing.' });
    }
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
          hunter_person_id VARCHAR(100),
          gmail_message_id VARCHAR(100),
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);
      await query(`ALTER TABLE sales_prospects ADD COLUMN IF NOT EXISTS hunter_person_id VARCHAR(100);`);
      await query(`
        CREATE TABLE IF NOT EXISTS tenant_hunter_settings (
          tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
          hunter_api_key TEXT NOT NULL,
          is_valid BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);

      const result = await query(
        "SELECT * FROM sales_prospects WHERE tenant_id = $1 ORDER BY created_at DESC;",
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
    const tenantId = req.user?.tenantId || req.user?.tenant_id || req.headers['x-tenant-id'] || req.body.tenant_id || '00000000-0000-0000-0000-000000000000';
    const { target_domain, prospect_limit, icp_config, auto_send_email } = req.body;

    console.log(`[BACKEND RUN PIPELINE] Initiating campaign. tenantId='${tenantId}', limit=${prospect_limit}, auto_send=${auto_send_email}`);

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
        timeout: 480000,
      }
    );

    console.log(`[BACKEND RUN PIPELINE] Agent response received! Success=${response.data?.success}, Background=${response.status === 202}`);
    return res.json({ success: true, result: response.data });
  } catch (err) {
    console.error('[BACKEND RUN PIPELINE ERROR] Error executing Sales SDR agent:', err.message, err.response?.data);
    return res.status(500).json({ error: 'Sales SDR Agent execution failed.', detail: err.response?.data || err.message });
  }
});

// POST /api/v1/sales/send-email — Manually send single outreach email via Gmail API
router.post('/send-email', async (req, res) => {
  try {
    const tenantId = req.user?.tenantId || req.user?.tenant_id || req.headers['x-tenant-id'] || req.body.tenant_id || '00000000-0000-0000-0000-000000000000';
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
    const tenantId = req.user?.tenantId || req.user?.tenant_id || req.headers['x-tenant-id'] || req.body.tenant_id || '00000000-0000-0000-0000-000000000000';
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
    const tenantId = req.user?.tenantId || req.user?.tenant_id || req.headers['x-tenant-id'] || '00000000-0000-0000-0000-000000000000';
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
    const tenantId = req.user?.tenantId || req.user?.tenant_id || req.headers['x-tenant-id'] || req.body.tenant_id || '00000000-0000-0000-0000-000000000000';
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

// GET /api/v1/sales/hunter-key & /api/v1/sales/apollo-key — Check Key Status (Deprecated stub)
router.get(['/hunter-key', '/apollo-key'], async (req, res) => {
  return res.json({ configured: true, is_valid: true });
});

// POST /api/v1/sales/check-replies
router.post('/check-replies', async (req, res) => {
  try {
    const tenantId = req.user?.tenantId || req.user?.tenant_id || req.headers['x-tenant-id'] || req.body.tenant_id || '00000000-0000-0000-0000-000000000000';
    const response = await axios.post(
      `${AGENT_URL}/agent/sales/check-replies`,
      { ...req.body, tenant_id: tenantId },
      { headers: { 'X-Internal-Token': INTERNAL_TOKEN }, timeout: 30000 }
    );
    return res.json(response.data);
  } catch (err) {
    console.error('Error checking email replies:', err.message);
    return res.status(500).json({ error: 'Failed to check email replies.' });
  }
});

// POST /api/v1/sales/send-reply
router.post('/send-reply', async (req, res) => {
  try {
    const tenantId = req.user?.tenantId || req.user?.tenant_id || req.headers['x-tenant-id'] || req.body.tenant_id || '00000000-0000-0000-0000-000000000000';
    const response = await axios.post(
      `${AGENT_URL}/agent/sales/send-reply`,
      { ...req.body, tenant_id: tenantId },
      { headers: { 'X-Internal-Token': INTERNAL_TOKEN } }
    );
    return res.json(response.data);
  } catch (err) {
    console.error('Error sending AI reply:', err.message);
    return res.status(500).json({ error: 'Failed to send AI reply.' });
  }
});

// POST /api/v1/sales/proposals/draft
router.post('/proposals/draft', async (req, res) => {
  try {
    const tenantId = req.user?.tenantId || req.user?.tenant_id || req.headers['x-tenant-id'] || req.body.tenant_id || '00000000-0000-0000-0000-000000000000';
    const response = await axios.post(
      `${AGENT_URL}/agent/sales/proposals/draft`,
      { ...req.body, tenant_id: tenantId },
      { headers: { 'X-Internal-Token': INTERNAL_TOKEN }, timeout: 30000 }
    );
    return res.json(response.data);
  } catch (err) {
    console.error('Error drafting sales proposal:', err.message);
    return res.status(500).json({ error: 'Failed to draft sales proposal.' });
  }
});

// POST /api/v1/sales/proposals/send
router.post('/proposals/send', async (req, res) => {
  try {
    const tenantId = req.user?.tenantId || req.user?.tenant_id || req.headers['x-tenant-id'] || req.body.tenant_id || '00000000-0000-0000-0000-000000000000';
    const response = await axios.post(
      `${AGENT_URL}/agent/sales/proposals/send`,
      { ...req.body, tenant_id: tenantId },
      { headers: { 'X-Internal-Token': INTERNAL_TOKEN } }
    );
    return res.json(response.data);
  } catch (err) {
    console.error('Error sending sales proposal:', err.message);
    return res.status(500).json({ error: 'Failed to send sales proposal.' });
  }
});

// GET /api/v1/sales/analytics
router.get('/analytics', async (req, res) => {
  try {
    const tenantId = req.user?.tenantId || req.user?.tenant_id || req.headers['x-tenant-id'] || '00000000-0000-0000-0000-000000000000';
    const response = await axios.get(
      `${AGENT_URL}/agent/sales/analytics/${tenantId}`,
      { headers: { 'X-Internal-Token': INTERNAL_TOKEN } }
    );
    return res.json(response.data);
  } catch (err) {
    console.error('Error fetching sales analytics:', err.message);
    return res.status(500).json({ error: 'Failed to fetch sales analytics.' });
  }
});

// POST /api/v1/sales/deal/confirm-sale
router.post('/deal/confirm-sale', async (req, res) => {
  try {
    const tenantId = req.user?.tenantId || req.user?.tenant_id || req.headers['x-tenant-id'] || req.body.tenant_id || '00000000-0000-0000-0000-000000000000';
    const response = await axios.post(
      `${AGENT_URL}/agent/sales/deal/confirm-sale`,
      { ...req.body, tenant_id: tenantId },
      { headers: { 'X-Internal-Token': INTERNAL_TOKEN } }
    );
    return res.json(response.data);
  } catch (err) {
    console.error('Error confirming sale & notifying finance agent:', err.message);
    return res.status(500).json({ error: 'Failed to confirm sale & notify finance agent.' });
  }
});

module.exports = router;

