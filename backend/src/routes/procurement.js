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

// GET /api/v1/procurement/requests/:id — Fetch single request detail, vendors, and appointment
router.get('/requests/:id', async (req, res) => {
  try {
    const tenantId = req.user?.tenantId || req.user?.tenant_id || req.headers['x-tenant-id'] || '00000000-0000-0000-0000-000000000000';
    const reqId = req.params.id;

    let reqRecord = null;
    let vendors = [];
    let docs = [];
    let appointment = null;

    try {
      const rRes = await query(`SELECT * FROM procurement_requests WHERE id = $1;`, [reqId], tenantId);
      if (rRes.rows.length > 0) {
        reqRecord = rRes.rows[0];
      }

      const vRes = await query(
        `SELECT id, procurement_id, vendor_name, vendor_phone, domain, place_id, address,
                google_rating, review_count, whatsapp_status, contact_status, quote_amount,
                lead_time_days, sla_terms, payment_terms, received_quote_payload,
                whatsapp_message_id, interview_availability, appointment_id, created_at
         FROM procurement_vendors 
         WHERE procurement_id = $1 
         ORDER BY created_at ASC;`,
        [reqId],
        tenantId
      );
      vendors = vRes.rows;

      const dRes = await query(`SELECT id, filename, mime_type, created_at FROM procurement_documents WHERE procurement_id = $1;`, [reqId], tenantId);
      docs = dRes.rows;

      // If appointment scheduled, load appointment details
      if (reqRecord && reqRecord.appointment_id) {
        const aRes = await query(`SELECT * FROM appointments WHERE id = $1;`, [reqRecord.appointment_id], tenantId);
        if (aRes.rows.length > 0) {
          appointment = aRes.rows[0];
        }
      }
    } catch (e) {
      console.warn('Query warning for single request:', e.message);
    }

    return res.json({
      success: true,
      request: reqRecord,
      vendors,
      documents: docs,
      appointment
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
      // 1. Google Places Vendor Discovery Output
      if (data.research_report) {
        await query(
          `UPDATE procurement_requests SET research_report = $1, current_stage = $2, active_subagent = $3, updated_at = NOW() WHERE id = $4;`,
          [JSON.stringify(data.research_report), data.next_stage, data.active_subagent, reqId],
          tenantId
        );
        if (data.vendors && data.vendors.length > 0) {
          // Clear any previous discovered vendors for this request to prevent duplication
          await query(`DELETE FROM procurement_vendors WHERE procurement_id = $1;`, [reqId], tenantId);
          for (let v of data.vendors) {
            await query(
              `INSERT INTO procurement_vendors (
                 procurement_id, tenant_id, vendor_name, vendor_phone, domain, place_id,
                 address, google_rating, review_count, whatsapp_status, contact_status
               ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'DISCOVERED');`,
              [
                reqId, tenantId, v.vendor_name, v.vendor_phone || null, v.domain || null,
                v.place_id || null, v.address || null, v.google_rating || 0.0,
                v.review_count || 0, v.whatsapp_status || 'ON_WHATSAPP'
              ],
              tenantId
            );
          }
        }
      } 
      // 2. WhatsApp RFQ Outreach Output
      else if (data.dispatched_vendors) {
        await query(
          `UPDATE procurement_requests SET current_stage = $1, active_subagent = $2, updated_at = NOW() WHERE id = $3;`,
          [data.next_stage, data.active_subagent, reqId],
          tenantId
        );
        for (let v of data.dispatched_vendors) {
          await query(
            `UPDATE procurement_vendors 
             SET contact_status = 'RFQ_SENT', whatsapp_message_id = $1
             WHERE procurement_id = $2 AND (id = $3 OR vendor_name = $4 OR vendor_phone = $5);`,
            [v.whatsapp_message_id || null, reqId, v.id || null, v.vendor_name, v.vendor_phone || null],
            tenantId
          );
        }
      }
      // 3. WhatsApp Quote Synthesis & Comparison Matrix Output
      else if (data.comparison_matrix) {
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
               WHERE procurement_id = $6 AND (vendor_name = $7 OR domain = $8 OR vendor_phone = $9);`,
              [v.quote_amount, v.lead_time_days, v.payment_terms, v.sla_terms, JSON.stringify(v.received_quote_payload || {}), reqId, v.vendor_name, v.domain, v.vendor_phone],
              tenantId
            );
          }
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

// POST /api/v1/procurement/requests/:id/select-vendor — HITL Vendor Selection -> Schedule WhatsApp Interview
router.post('/requests/:id/select-vendor', async (req, res) => {
  try {
    const tenantId = req.user?.tenantId || req.user?.tenant_id || req.headers['x-tenant-id'] || '00000000-0000-0000-0000-000000000000';
    const reqId = req.params.id;
    const { selected_vendor_id, selection_notes, preferred_date, preferred_time } = req.body;

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

    // Invoke Interview Scheduler Sub-Agent (Sub-Agent 5)
    // Sends WhatsApp invitation, collects availability, books appointment into `appointments` table
    const agentRes = await axios.post(
      `${AGENT_URL}/agent/procurement/run-supervisor`,
      {
        id: reqId,
        stage: 'AWAITING_SELECTION',
        tenant_id: tenantId,
        title: reqRecord.title,
        department: reqRecord.department,
        selected_vendor_id,
        selection_notes,
        vendors,
        preferred_date,
        preferred_time
      },
      { headers: { 'X-Internal-Token': INTERNAL_TOKEN }, timeout: 60000 }
    );

    const data = agentRes.data;
    const appointmentId = data.appointment?.id || null;

    // Update procurement_requests record: Stage is INTERVIEW_SCHEDULED, agent duty is finished
    try {
      await query(
        `UPDATE procurement_requests 
         SET selected_vendor_id = $1, 
             selection_notes = $2, 
             appointment_id = $3, 
             interview_scheduled_at = NOW(), 
             current_stage = 'INTERVIEW_SCHEDULED', 
             active_subagent = 'agent_duty_complete', 
             final_report = $4,
             updated_at = NOW()
         WHERE id = $5;`,
        [selected_vendor_id, selection_notes || '', appointmentId, JSON.stringify(data), reqId],
        tenantId
      );

      // Update selected vendor in procurement_vendors
      const selVendor = data.selected_vendor || {};
      await query(
        `UPDATE procurement_vendors 
         SET contact_status = 'INTERVIEW_SCHEDULED', 
             appointment_id = $1, 
             interview_requested_at = NOW(), 
             interview_availability = $2, 
             whatsapp_message_id = $3
         WHERE procurement_id = $4 AND (id = $5 OR vendor_name = $6);`,
        [
          appointmentId,
          selVendor.interview_availability || 'Confirmed availability',
          selVendor.whatsapp_message_id || null,
          reqId,
          selected_vendor_id,
          selVendor.vendor_name || ''
        ],
        tenantId
      );

      // Other non-selected vendors are marked NOT_SHORTLISTED (no regret emails/calls dispatched)
      await query(
        `UPDATE procurement_vendors 
         SET contact_status = 'NOT_SHORTLISTED'
         WHERE procurement_id = $1 AND id != $2 AND vendor_name != $3;`,
        [reqId, selected_vendor_id, selVendor.vendor_name || ''],
        tenantId
      );
    } catch (dbErr) {
      console.warn('DB update after interview scheduling warning:', dbErr.message);
    }

    // IMPORTANT: No Finance Agent sync, No Purchase Orders created, No GL entries reserved.
    // Agent duties are officially over.
    return res.json({
      success: true,
      selected_vendor_id,
      current_stage: 'INTERVIEW_SCHEDULED',
      active_subagent: 'agent_duty_complete',
      agent_duty_complete: true,
      appointment: data.appointment,
      whatsapp_outreach: data.whatsapp_outreach,
      closing_instructions: data.closing_instructions || (
        "Vendor interview scheduled successfully via WhatsApp. Human company representative will conduct the interview and handle final decisions."
      )
    });
  } catch (err) {
    console.error('Error submitting vendor selection decision:', err.message);
    return res.status(500).json({ error: 'Failed to execute interview scheduling.' });
  }
});

module.exports = router;
