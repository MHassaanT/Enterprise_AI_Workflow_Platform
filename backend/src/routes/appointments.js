const express = require('express');
const router = express.Router();
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');

// ── GET /api/appointments ──
// List all appointments for the authenticated tenant
router.get('/', authenticate, async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { status, date, search } = req.query;

    let sql = `
      SELECT * FROM appointments 
      WHERE tenant_id = $1
    `;
    const params = [tenantId];
    let idx = 2;

    if (status && status !== 'all') {
      sql += ` AND status = $${idx}`;
      params.push(status.toLowerCase());
      idx++;
    }

    if (date) {
      sql += ` AND appointment_date = $${idx}`;
      params.push(date);
      idx++;
    }

    if (search) {
      sql += ` AND (
        customer_name ILIKE $${idx} OR 
        customer_email ILIKE $${idx} OR 
        customer_phone ILIKE $${idx} OR 
        service_type ILIKE $${idx} OR 
        notes ILIKE $${idx}
      )`;
      params.push(`%${search.trim()}%`);
      idx++;
    }

    sql += ` ORDER BY appointment_date ASC, appointment_time ASC`;

    const result = await query(sql, params, tenantId);
    res.json({ appointments: result.rows, count: result.rowCount });
  } catch (error) {
    console.error('Error fetching appointments:', error);
    res.status(500).json({ error: 'Failed to fetch appointments.' });
  }
});

// ── GET /api/appointments/:id ──
// Get single appointment details
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;

    const result = await query(
      `SELECT * FROM appointments WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
      tenantId
    );

    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Appointment not found.' });
    }

    res.json({ appointment: result.rows[0] });
  } catch (error) {
    console.error('Error fetching appointment:', error);
    res.status(500).json({ error: 'Failed to fetch appointment.' });
  }
});

// ── POST /api/appointments ──
// Manually create an appointment (admin or staff)
router.post('/', authenticate, async (req, res) => {
  try {
    const { tenantId } = req.user;
    const {
      customer_name,
      customer_email,
      customer_phone,
      service_type,
      appointment_date,
      appointment_time,
      duration_minutes = 60,
      notes = '',
      status = 'scheduled'
    } = req.body;

    if (!customer_name || !customer_email || !service_type || !appointment_date || !appointment_time) {
      return res.status(400).json({
        error: 'customer_name, customer_email, service_type, appointment_date, and appointment_time are required.'
      });
    }

    const result = await query(
      `INSERT INTO appointments (
        tenant_id, customer_name, customer_email, customer_phone,
        service_type, appointment_date, appointment_time,
        duration_minutes, notes, status, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'manual')
      RETURNING *`,
      [
        tenantId,
        customer_name.trim(),
        customer_email.trim().toLowerCase(),
        customer_phone ? customer_phone.trim() : null,
        service_type.trim(),
        appointment_date,
        appointment_time.trim(),
        parseInt(duration_minutes) || 60,
        notes || '',
        status
      ],
      tenantId
    );

    res.status(201).json({ appointment: result.rows[0] });
  } catch (error) {
    console.error('Error creating appointment:', error);
    res.status(500).json({ error: 'Failed to create appointment.' });
  }
});

// ── PATCH /api/appointments/:id ──
// Update appointment status (completed, cancelled, rescheduled) or details
router.patch('/:id', authenticate, async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;
    const { status, notes, appointment_date, appointment_time, duration_minutes } = req.body;

    const updates = [];
    const params = [];
    let idx = 1;

    if (status) {
      updates.push(`status = $${idx}`);
      params.push(status.toLowerCase());
      idx++;
    }

    if (notes !== undefined) {
      updates.push(`notes = $${idx}`);
      params.push(notes);
      idx++;
    }

    if (appointment_date) {
      updates.push(`appointment_date = $${idx}`);
      params.push(appointment_date);
      idx++;
    }

    if (appointment_time) {
      updates.push(`appointment_time = $${idx}`);
      params.push(appointment_time);
      idx++;
    }

    if (duration_minutes) {
      updates.push(`duration_minutes = $${idx}`);
      params.push(parseInt(duration_minutes));
      idx++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields provided to update.' });
    }

    updates.push(`updated_at = NOW()`);
    params.push(id);
    params.push(tenantId);

    const sql = `
      UPDATE appointments 
      SET ${updates.join(', ')}
      WHERE id = $${idx} AND tenant_id = $${idx + 1}
      RETURNING *
    `;

    const result = await query(sql, params, tenantId);

    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Appointment not found.' });
    }

    res.json({ appointment: result.rows[0] });
  } catch (error) {
    console.error('Error updating appointment:', error);
    res.status(500).json({ error: 'Failed to update appointment.' });
  }
});

// ── DELETE /api/appointments/:id ──
// Delete appointment
router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;

    const result = await query(
      `DELETE FROM appointments WHERE id = $1 AND tenant_id = $2 RETURNING id`,
      [id, tenantId],
      tenantId
    );

    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Appointment not found.' });
    }

    res.json({ message: 'Appointment deleted successfully.', id });
  } catch (error) {
    console.error('Error deleting appointment:', error);
    res.status(500).json({ error: 'Failed to delete appointment.' });
  }
});

module.exports = router;
