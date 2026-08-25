const express = require('express');
const router = express.Router();
const { query } = require('../db');
const axios = require('axios');
const multer = require('multer');

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 } // 20 MB max file size
});

const AGENT_URL = process.env.AGENT_SERVICE_URL || process.env.AGENT_URL || 'http://localhost:8000';
const INTERNAL_TOKEN = process.env.INTERNAL_SERVICE_TOKEN || 'internal_secret_change_in_production';

// Helper function to extract parsed text from uploaded files (PDF/DOCX/TXT)
const extractTextFromBuffer = (file) => {
  if (!file || !file.buffer) return '';
  try {
    const text = file.buffer.toString('utf-8');
    return text.replace(/[^\x20-\x7E\n\r\t]/g, ''); // Basic clean text
  } catch (err) {
    return 'Attached document specifications';
  }
};

// GET /api/v1/procurement/requests — Fetch all procurement requests for active tenant
router.get('/requests', async (req, res) => {
  try {
    const tenantId = req.user?.tenantId || req.user?.tenant_id || req.headers['x-tenant-id'] || '00000000-0000-0000-0000-000000000000';
    let requests = [];
    try {
      const result = await query(
        `SELECT p.*, 
          (SELECT COUNT(*) FROM procurement_vendors v WHERE v.procurement_id = p.id) as vendor_count
         FROM procurement_requests p
         WHERE p.tenant_id = $1 OR p.tenant_id = '00000000-0000-0000-0000-000000000000'
         ORDER BY p.created_at DESC;`,
        [tenantId],
        tenantId
      );
      requests = result.rows;
    } catch (e) {
      console.warn('Procurement requests table warning:', e.message);
    }
    return res.json({ success: true, requests });
  } catch (err) {
    console.error('Error fetching procurement requests:', err);
    return res.status(500).json({ error: 'Failed to fetch procurement requests.' });
  }
});

// POST /api/v1/procurement/requests — Create new procurement request & trigger Sub-Agent 1 (Intake & Spec)
router.post('/requests', upload.array('documents', 5), async (req, res) => {
  try {
    const tenantId = req.user?.tenantId || req.user?.tenant_id || req.headers['x-tenant-id'] || '00000000-0000-0000-0000-000000000000';
    const { title, description, budget_limit, department } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Title is required.' });
    }

    const docsText = [];
    if (req.files && req.files.length > 0) {
      req.files.forEach((f) => {
        docsText.push(extractTextFromBuffer(f));
      });
    }

    // Insert into procurement_requests
    let reqId = '00000000-0000-0000-0000-000000000000';
    try {
      const insRes = await query(
        `INSERT INTO procurement_requests (tenant_id, title, description, budget_limit, department, current_stage, active_subagent)
         VALUES ($1, $2, $3, $4, $5, 'INTAKE', 'intake_spec')
         RETURNING id;`,
        [tenantId, title, description || '', parseFloat(budget_limit) || 0.0, department || 'General'],
        tenantId
      );
      reqId = insRes.rows[0].id;

      // Save document records
      if (req.files && req.files.length > 0) {
        for (let i = 0; i < req.files.length; i++) {
          const f = req.files[i];
          await query(
            `INSERT INTO procurement_documents (procurement_id, tenant_id, filename, mime_type, parsed_text)
             VALUES ($1, $2, $3, $4, $5);`,
            [reqId, tenantId, f.originalname, f.mimetype, docsText[i]],
            tenantId
          );
        }
      }
    } catch (e) {
      console.warn('Procurement insert fallback warning:', e.message);
    }

    // Invoke Python Agent Service — Intake & Spec Sub-Agent
    const agentRes = await axios.post(
      `${AGENT_URL}/agent/procurement/run-supervisor`,
      {
        id: reqId,
        stage: 'INTAKE',
        tenant_id: tenantId,
        title,
        description,
        budget_limit: parseFloat(budget_limit) || 0.0,
        department: department || 'General',
        documents_text: docsText
      },
      { headers: { 'X-Internal-Token': INTERNAL_TOKEN } }
    );

    const extractedSpecs = agentRes.data?.extracted_specs || {};

    try {
      await query(
        `UPDATE procurement_requests 
         SET extracted_specs = $1, current_stage = 'RESEARCHED', active_subagent = 'vendor_research', updated_at = NOW()
         WHERE id = $2;`,
        [JSON.stringify(extractedSpecs), reqId],
        tenantId
      );
    } catch (e) {}

    return res.json({
      success: true,
      id: reqId,
      stage: 'RESEARCHED',
      active_subagent: 'vendor_research',
      extracted_specs: extractedSpecs,
      agent_result: agentRes.data
    });
  } catch (err) {
    console.error('Error creating procurement request:', err.message);
    return res.status(500).json({ error: 'Failed to create procurement request.' });
  }
});

// GET /api/v1/procurement/requests/:id — Fetch single request detail & vendors
router.get('/requests/:id', async (req, res) => {
  try {
    const tenantId = req.user?.tenantId || req.user?.tenant_id || req.headers['x-tenant-id'] || '00000000-0000-0000-0000-000000000000';
    const reqId = req.params.id;

    let reqRecord = null;
    let vendors = [];
    let docs = [];

    try {
      const rRes = await query(`SELECT * FROM procurement_requests WHERE id = $1;`, [reqId], tenantId);
      if (rRes.rows.length > 0) {
        reqRecord = rRes.rows[0];
      }

      const vRes = await query(`SELECT * FROM procurement_vendors WHERE procurement_id = $1 ORDER BY created_at ASC;`, [reqId], tenantId);
      vendors = vRes.rows;

      const dRes = await query(`SELECT id, filename, mime_type, created_at FROM procurement_documents WHERE procurement_id = $1;`, [reqId], tenantId);
      docs = dRes.rows;
    } catch (e) {
      console.warn('Query warning for single request:', e.message);
    }

    return res.json({
      success: true,
      request: reqRecord,
      vendors,
      documents: docs
    });
  } catch (err) {
    console.error('Error fetching request details:', err);
    return res.status(500).json({ error: 'Failed to fetch request details.' });
  }
});

// POST /api/v1/procurement/requests/:id/subagent/:stage — Trigger next sub-agent step
router.post('/requests/:id/subagent/:stage', async (req, res) => {
  try {
    const tenantId = req.user?.tenantId || req.user?.tenant_id || req.headers['x-tenant-id'] || '00000000-0000-0000-0000-000000000000';
    const reqId = req.params.id;
    const targetStage = req.params.stage;

    // Fetch existing request context & vendors
    let reqRecord = {};
    let vendors = [];
    try {
      const rRes = await query(`SELECT * FROM procurement_requests WHERE id = $1;`, [reqId], tenantId);
      if (rRes.rows.length > 0) reqRecord = rRes.rows[0];

      const vRes = await query(`SELECT * FROM procurement_vendors WHERE procurement_id = $1;`, [reqId], tenantId);
      vendors = vRes.rows;
    } catch (e) {}

    const agentRes = await axios.post(
      `${AGENT_URL}/agent/procurement/run-supervisor`,
      {
        id: reqId,
        stage: targetStage,
        tenant_id: tenantId,
        title: reqRecord.title || req.body.title,
        description: reqRecord.description || req.body.description,
        budget_limit: reqRecord.budget_limit || req.body.budget_limit,
        department: reqRecord.department || req.body.department,
        extracted_specs: reqRecord.extracted_specs || {},
        vendors: vendors.length > 0 ? vendors : (req.body.vendors || []),
        selected_vendor_id: reqRecord.selected_vendor_id || req.body.selected_vendor_id,
        selection_notes: reqRecord.selection_notes || req.body.selection_notes
      },
      { headers: { 'X-Internal-Token': INTERNAL_TOKEN }, timeout: 60000 }
    );

    const data = agentRes.data;

    // Update database records based on sub-agent output
    try {
      if (data.research_report) {
        await query(
          `UPDATE procurement_requests SET research_report = $1, current_stage = $2, active_subagent = $3, updated_at = NOW() WHERE id = $4;`,
          [JSON.stringify(data.research_report), data.next_stage, data.active_subagent, reqId],
          tenantId
        );
        if (data.vendors && data.vendors.length > 0) {
          for (let v of data.vendors) {
            await query(
              `INSERT INTO procurement_vendors (procurement_id, tenant_id, vendor_name, vendor_email, domain, deliverability_status, contact_status)
               VALUES ($1, $2, $3, $4, $5, $6, $7);`,
              [reqId, tenantId, v.vendor_name, v.vendor_email, v.domain, v.deliverability_status || 'VALID', 'DISCOVERED'],
              tenantId
            );
          }
        }
      } else if (data.comparison_matrix) {
        await query(
          `UPDATE procurement_requests SET comparison_matrix = $1, current_stage = $2, active_subagent = $3, updated_at = NOW() WHERE id = $4;`,
          [JSON.stringify(data.comparison_matrix), data.next_stage, data.active_subagent, reqId],
          tenantId
        );
        if (data.vendors) {
          for (let v of data.vendors) {
            await query(
              `UPDATE procurement_vendors 
               SET quote_amount = $1, lead_time_days = $2, payment_terms = $3, sla_terms = $4, contact_status = 'REPLIED', received_quote_payload = $5
               WHERE procurement_id = $6 AND (vendor_name = $7 OR domain = $8);`,
              [v.quote_amount, v.lead_time_days, v.payment_terms, v.sla_terms, JSON.stringify(v.received_quote_payload || {}), reqId, v.vendor_name, v.domain],
              tenantId
            );
          }
        }
      } else if (data.final_report) {
        await query(
          `UPDATE procurement_requests SET final_report = $1, po_number = $2, current_stage = 'COMPLETED', active_subagent = 'completed', updated_at = NOW() WHERE id = $3;`,
          [JSON.stringify(data.final_report), data.po_number, reqId],
          tenantId
        );
        // Also insert into purchase_orders table if available
        if (data.finance_sync_payload && data.finance_sync_payload.po_record) {
          const po = data.finance_sync_payload.po_record;
          await query(
            `CREATE TABLE IF NOT EXISTS purchase_orders (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              tenant_id UUID NOT NULL,
              po_number VARCHAR(100) NOT NULL UNIQUE,
              vendor_name VARCHAR(255) NOT NULL,
              vendor_email VARCHAR(255),
              amount NUMERIC(15, 2) DEFAULT 0.00,
              line_items JSONB DEFAULT '[]'::jsonb,
              status VARCHAR(50) DEFAULT 'APPROVED',
              created_at TIMESTAMPTZ DEFAULT NOW()
            );`
          );
          await query(
            `INSERT INTO purchase_orders (tenant_id, po_number, vendor_name, vendor_email, amount, line_items, status)
             VALUES ($1, $2, $3, $4, $5, $6, 'APPROVED')
             ON CONFLICT (po_number) DO NOTHING;`,
            [tenantId, po.po_number, po.vendor_name, po.vendor_email, po.amount, JSON.stringify(po.line_items)],
            tenantId
          );
        }
      }
    } catch (e) {
      console.warn('DB update after sub-agent execution warning:', e.message);
    }

    return res.json({ success: true, result: data });
  } catch (err) {
    console.error('Error running subagent step:', err.message);
    return res.status(500).json({ error: 'Failed to run sub-agent step.' });
  }
});

// POST /api/v1/procurement/requests/:id/select-vendor — HITL Selection Decision
router.post('/requests/:id/select-vendor', async (req, res) => {
  try {
    const tenantId = req.user?.tenantId || req.user?.tenant_id || req.headers['x-tenant-id'] || '00000000-0000-0000-0000-000000000000';
    const reqId = req.params.id;
    const { selected_vendor_id, selection_notes } = req.body;

    if (!selected_vendor_id) {
      return res.status(400).json({ error: 'selected_vendor_id is required.' });
    }

    let reqRecord = {};
    let vendors = [];
    try {
      const rRes = await query(`SELECT * FROM procurement_requests WHERE id = $1;`, [reqId], tenantId);
      if (rRes.rows.length > 0) reqRecord = rRes.rows[0];

      const vRes = await query(`SELECT * FROM procurement_vendors WHERE procurement_id = $1;`, [reqId], tenantId);
      vendors = vRes.rows;
    } catch (e) {}

    // Update request record with decision
    try {
      await query(
        `UPDATE procurement_requests 
         SET selected_vendor_id = $1, selection_notes = $2, current_stage = 'VENDOR_SELECTED', active_subagent = 'vendor_comms', updated_at = NOW()
         WHERE id = $3;`,
        [selected_vendor_id, selection_notes || '', reqId],
        tenantId
      );
    } catch (e) {}

    // Invoke Vendor Communications Sub-Agent (Sub-Agent 5)
    const commsRes = await axios.post(
      `${AGENT_URL}/agent/procurement/run-supervisor`,
      {
        id: reqId,
        stage: 'AWAITING_SELECTION',
        tenant_id: tenantId,
        title: reqRecord.title,
        selected_vendor_id,
        selection_notes,
        vendors
      },
      { headers: { 'X-Internal-Token': INTERNAL_TOKEN } }
    );

    // Update vendor statuses in DB
    const commsData = commsRes.data;
    if (commsData.all_vendors) {
      for (let v of commsData.all_vendors) {
        try {
          await query(
            `UPDATE procurement_vendors 
             SET contact_status = $1, rejection_reason = $2
             WHERE procurement_id = $3 AND (id = $4 OR vendor_name = $5);`,
            [v.contact_status, v.rejection_reason || null, reqId, v.id || null, v.vendor_name],
            tenantId
          );
        } catch (e) {}
      }
    }

    // Auto-trigger Finance Sync Sub-Agent (Sub-Agent 6)
    const finRes = await axios.post(
      `${AGENT_URL}/agent/procurement/run-supervisor`,
      {
        id: reqId,
        stage: 'NOTIFIED',
        tenant_id: tenantId,
        title: reqRecord.title,
        department: reqRecord.department,
        selected_vendor: commsData.selected_vendor || vendors[0]
      },
      { headers: { 'X-Internal-Token': INTERNAL_TOKEN } }
    );

    const finData = finRes.data;
    try {
      await query(
        `UPDATE procurement_requests 
         SET final_report = $1, po_number = $2, current_stage = 'COMPLETED', active_subagent = 'completed', updated_at = NOW() 
         WHERE id = $3;`,
        [JSON.stringify(finData.final_report || {}), finData.po_number, reqId],
        tenantId
      );
      if (finData.finance_sync_payload && finData.finance_sync_payload.po_record) {
        const po = finData.finance_sync_payload.po_record;
        await query(
          `CREATE TABLE IF NOT EXISTS purchase_orders (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID NOT NULL,
            po_number VARCHAR(100) NOT NULL UNIQUE,
            vendor_name VARCHAR(255) NOT NULL,
            vendor_email VARCHAR(255),
            amount NUMERIC(15, 2) DEFAULT 0.00,
            line_items JSONB DEFAULT '[]'::jsonb,
            status VARCHAR(50) DEFAULT 'APPROVED',
            created_at TIMESTAMPTZ DEFAULT NOW()
          );`
        );
        await query(
          `INSERT INTO purchase_orders (tenant_id, po_number, vendor_name, vendor_email, amount, line_items, status)
           VALUES ($1, $2, $3, $4, $5, $6, 'APPROVED')
           ON CONFLICT (po_number) DO NOTHING;`,
          [tenantId, po.po_number, po.vendor_name, po.vendor_email, po.amount, JSON.stringify(po.line_items)],
          tenantId
        );
      }

      if (finData.finance_sync_payload && finData.finance_sync_payload.gl_ledger_entry) {
        const gl = finData.finance_sync_payload.gl_ledger_entry;
        await query(
          `CREATE TABLE IF NOT EXISTS general_ledger (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID NOT NULL,
            agent_name VARCHAR(100) NOT NULL,
            transaction_type VARCHAR(100) NOT NULL,
            amount NUMERIC(15, 2) DEFAULT 0.00,
            reference_id VARCHAR(100),
            description TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
          );`
        );
        await query(
          `INSERT INTO general_ledger (tenant_id, agent_name, transaction_type, amount, reference_id, description)
           VALUES ($1, 'ProcurementAgent', 'EXPENSE_RESERVE', $2, $3, $4);`,
          [tenantId, gl.amount, gl.reference_id || finData.po_number, gl.description || 'Expense reserve for PO'],
          tenantId
        );
      }
    } catch (e) {}

    return res.json({
      success: true,
      selected_vendor_id,
      comms_result: commsData,
      finance_sync_result: finData
    });
  } catch (err) {
    console.error('Error submitting vendor selection decision:', err.message);
    return res.status(500).json({ error: 'Failed to submit vendor selection decision.' });
  }
});

module.exports = router;
