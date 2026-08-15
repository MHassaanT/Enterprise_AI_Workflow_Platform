const express = require('express');
const router = express.Router();
const multer = require('multer');
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');

// ── MULTER CONFIG for CSV/XLSX Import ──
const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [
      'text/csv',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ];
    if (allowed.includes(file.mimetype) || file.originalname.endsWith('.csv') || file.originalname.endsWith('.xlsx')) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type. Only CSV and XLSX are allowed.'));
    }
  },
});

// ═══════════════════════════════════════════════════════
//  EMPLOYEES
// ═══════════════════════════════════════════════════════

// ── CREATE EMPLOYEE ──
router.post('/employees', authenticate, authorize('admin', 'employee'), async (req, res) => {
  const { tenantId } = req.user;
  const { name, email, position, department, hire_date } = req.body;

  if (!name || !email || !position) {
    return res.status(400).json({ error: 'name, email, and position are required.' });
  }

  try {
    const result = await query(
      `INSERT INTO hr_employees (tenant_id, name, email, position, department, hire_date)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [tenantId, name, email, position, department || null, hire_date || null],
      tenantId
    );
    res.status(201).json({ employee: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'An employee with this email already exists.' });
    }
    throw err;
  }
});

// ── LIST EMPLOYEES ──
router.get('/employees', authenticate, authorize('admin', 'employee', 'reviewer'), async (req, res) => {
  const { tenantId } = req.user;

  const result = await query(
    `SELECT e.*, 
            COALESCE(
              (SELECT json_agg(json_build_object('project_id', pm.project_id, 'role', pm.role, 'project_name', p.name))
               FROM hr_project_members pm
               JOIN hr_projects p ON pm.project_id = p.id
               WHERE pm.employee_id = e.id), '[]'::json
            ) as projects
     FROM hr_employees e
     WHERE e.tenant_id = $1
     ORDER BY e.name ASC`,
    [tenantId],
    tenantId
  );

  res.json({ employees: result.rows });
});

// ── GET SINGLE EMPLOYEE ──
router.get('/employees/:id', authenticate, authorize('admin', 'employee', 'reviewer'), async (req, res) => {
  const { tenantId } = req.user;
  const { id } = req.params;

  const empResult = await query(
    `SELECT * FROM hr_employees WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId],
    tenantId
  );

  if (!empResult.rows[0]) {
    return res.status(404).json({ error: 'Employee not found.' });
  }

  // Get project assignments
  const projectsResult = await query(
    `SELECT pm.id as member_id, pm.role, pm.responsibilities, pm.assigned_at,
            p.id as project_id, p.name as project_name, p.status as project_status, p.current_progress
     FROM hr_project_members pm
     JOIN hr_projects p ON pm.project_id = p.id
     WHERE pm.employee_id = $1`,
    [id],
    tenantId
  );

  res.json({
    employee: empResult.rows[0],
    projects: projectsResult.rows,
  });
});

// ── UPDATE EMPLOYEE ──
router.patch('/employees/:id', authenticate, authorize('admin'), async (req, res) => {
  const { tenantId } = req.user;
  const { id } = req.params;
  const { name, email, position, department, hire_date, status } = req.body;

  const fields = [];
  const values = [];
  let paramIdx = 1;

  if (name !== undefined) { fields.push(`name = $${paramIdx++}`); values.push(name); }
  if (email !== undefined) { fields.push(`email = $${paramIdx++}`); values.push(email); }
  if (position !== undefined) { fields.push(`position = $${paramIdx++}`); values.push(position); }
  if (department !== undefined) { fields.push(`department = $${paramIdx++}`); values.push(department); }
  if (hire_date !== undefined) { fields.push(`hire_date = $${paramIdx++}`); values.push(hire_date); }
  if (status !== undefined) { fields.push(`status = $${paramIdx++}`); values.push(status); }

  if (fields.length === 0) {
    return res.status(400).json({ error: 'No fields to update.' });
  }

  fields.push(`updated_at = NOW()`);
  values.push(id, tenantId);

  const result = await query(
    `UPDATE hr_employees SET ${fields.join(', ')} WHERE id = $${paramIdx++} AND tenant_id = $${paramIdx} RETURNING *`,
    values,
    tenantId
  );

  if (!result.rows[0]) {
    return res.status(404).json({ error: 'Employee not found.' });
  }

  res.json({ employee: result.rows[0] });
});

// ── DELETE EMPLOYEE ──
router.delete('/employees/:id', authenticate, authorize('admin'), async (req, res) => {
  const { tenantId } = req.user;
  const { id } = req.params;

  await query(`DELETE FROM hr_employees WHERE id = $1 AND tenant_id = $2`, [id, tenantId], tenantId);
  res.json({ message: 'Employee deleted.' });
});

// ── IMPORT EMPLOYEES (CSV/XLSX) ──
router.post('/employees/import', authenticate, authorize('admin'), importUpload.single('file'), async (req, res) => {
  const { tenantId } = req.user;

  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded.' });
  }

  const { buffer, originalname, mimetype } = req.file;
  let rows = [];

  try {
    if (originalname.endsWith('.csv') || mimetype === 'text/csv') {
      // Parse CSV
      const csvText = buffer.toString('utf-8');
      const lines = csvText.split('\n').filter(l => l.trim());
      if (lines.length < 2) {
        return res.status(400).json({ error: 'CSV must have a header row and at least one data row.' });
      }
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim());
        const row = {};
        headers.forEach((h, idx) => { row[h] = cols[idx] || ''; });
        rows.push(row);
      }
    } else {
      // Parse XLSX using a lightweight approach
      // We'll use the xlsx package if available, otherwise parse manually
      try {
        const XLSX = require('xlsx');
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        rows = XLSX.utils.sheet_to_json(sheet);
        // Normalize keys to lowercase
        rows = rows.map(r => {
          const normalized = {};
          Object.keys(r).forEach(k => { normalized[k.toLowerCase()] = r[k]; });
          return normalized;
        });
      } catch (xlsxErr) {
        return res.status(400).json({ error: 'XLSX parsing failed. Install xlsx package or use CSV format.' });
      }
    }

    // Validate required fields
    const imported = [];
    const errors = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const name = r.name || r.full_name || r.employee_name;
      const email = r.email || r.email_address;
      const position = r.position || r.title || r.job_title || r.role;

      if (!name || !email || !position) {
        errors.push({ row: i + 2, error: 'Missing name, email, or position' });
        continue;
      }

      try {
        const result = await query(
          `INSERT INTO hr_employees (tenant_id, name, email, position, department, hire_date)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (tenant_id, email) DO UPDATE SET
             name = EXCLUDED.name, position = EXCLUDED.position,
             department = EXCLUDED.department, updated_at = NOW()
           RETURNING id`,
          [tenantId, name, email, position, r.department || null, r.hire_date || r.start_date || null],
          tenantId
        );
        imported.push({ id: result.rows[0].id, name, email });
      } catch (err) {
        errors.push({ row: i + 2, error: err.message });
      }
    }

    res.json({ imported: imported.length, errors, total: rows.length });
  } catch (err) {
    console.error('[HR Import Error]', err);
    res.status(500).json({ error: 'Failed to import employees.' });
  }
});

// ═══════════════════════════════════════════════════════
//  PROJECTS
// ═══════════════════════════════════════════════════════

// ── CREATE PROJECT ──
router.post('/projects', authenticate, authorize('admin', 'employee'), async (req, res) => {
  const { tenantId } = req.user;
  const { name, description, start_date, expected_completion } = req.body;

  if (!name || !start_date || !expected_completion) {
    return res.status(400).json({ error: 'name, start_date, and expected_completion are required.' });
  }

  const result = await query(
    `INSERT INTO hr_projects (tenant_id, name, description, start_date, expected_completion)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [tenantId, name, description || null, start_date, expected_completion],
    tenantId
  );

  res.status(201).json({ project: result.rows[0] });
});

// ── LIST PROJECTS ──
router.get('/projects', authenticate, authorize('admin', 'employee', 'reviewer'), async (req, res) => {
  const { tenantId } = req.user;

  const result = await query(
    `SELECT p.*,
            COALESCE(
              (SELECT COUNT(*) FROM hr_project_members pm WHERE pm.project_id = p.id), 0
            )::int as member_count,
            COALESCE(
              (SELECT json_agg(json_build_object('employee_id', pm.employee_id, 'name', e.name, 'role', pm.role))
               FROM hr_project_members pm
               JOIN hr_employees e ON pm.employee_id = e.id
               WHERE pm.project_id = p.id), '[]'::json
            ) as members
     FROM hr_projects p
     WHERE p.tenant_id = $1
     ORDER BY p.created_at DESC`,
    [tenantId],
    tenantId
  );

  res.json({ projects: result.rows });
});

// ── GET SINGLE PROJECT ──
router.get('/projects/:id', authenticate, authorize('admin', 'employee', 'reviewer'), async (req, res) => {
  const { tenantId } = req.user;
  const { id } = req.params;

  const projResult = await query(
    `SELECT * FROM hr_projects WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId],
    tenantId
  );

  if (!projResult.rows[0]) {
    return res.status(404).json({ error: 'Project not found.' });
  }

  // Get members
  const membersResult = await query(
    `SELECT pm.id as member_id, pm.role, pm.responsibilities, pm.assigned_at,
            e.id as employee_id, e.name, e.email, e.position, e.department
     FROM hr_project_members pm
     JOIN hr_employees e ON pm.employee_id = e.id
     WHERE pm.project_id = $1
     ORDER BY pm.assigned_at ASC`,
    [id],
    tenantId
  );

  // Get recent updates
  const updatesResult = await query(
    `SELECT u.*, e.name as submitted_by_name
     FROM hr_project_updates u
     JOIN hr_employees e ON u.submitted_by = e.id
     WHERE u.project_id = $1
     ORDER BY u.created_at DESC
     LIMIT 20`,
    [id],
    tenantId
  );

  // Calculate pacing
  const project = projResult.rows[0];
  const startDate = new Date(project.start_date);
  const endDate = new Date(project.expected_completion);
  const now = new Date();
  const totalDays = Math.max(1, (endDate - startDate) / (1000 * 60 * 60 * 24));
  const elapsedDays = Math.max(0, (now - startDate) / (1000 * 60 * 60 * 24));
  const expectedProgress = Math.min(100, Math.round((elapsedDays / totalDays) * 100));
  const pacingDelta = project.current_progress - expectedProgress;

  let pacingStatus = 'on_track';
  if (pacingDelta < -15) pacingStatus = 'behind';
  else if (pacingDelta < -5) pacingStatus = 'at_risk';
  else if (pacingDelta > 10) pacingStatus = 'ahead';

  res.json({
    project: {
      ...project,
      expected_progress: expectedProgress,
      pacing_delta: pacingDelta,
      pacing_status: pacingStatus,
    },
    members: membersResult.rows,
    updates: updatesResult.rows,
  });
});

// ── UPDATE PROJECT ──
router.patch('/projects/:id', authenticate, authorize('admin', 'employee'), async (req, res) => {
  const { tenantId } = req.user;
  const { id } = req.params;
  const { name, description, start_date, expected_completion, actual_completion, status, current_progress } = req.body;

  const fields = [];
  const values = [];
  let paramIdx = 1;

  if (name !== undefined) { fields.push(`name = $${paramIdx++}`); values.push(name); }
  if (description !== undefined) { fields.push(`description = $${paramIdx++}`); values.push(description); }
  if (start_date !== undefined) { fields.push(`start_date = $${paramIdx++}`); values.push(start_date); }
  if (expected_completion !== undefined) { fields.push(`expected_completion = $${paramIdx++}`); values.push(expected_completion); }
  if (actual_completion !== undefined) { fields.push(`actual_completion = $${paramIdx++}`); values.push(actual_completion); }
  if (status !== undefined) { fields.push(`status = $${paramIdx++}`); values.push(status); }
  if (current_progress !== undefined) { fields.push(`current_progress = $${paramIdx++}`); values.push(current_progress); }

  if (fields.length === 0) {
    return res.status(400).json({ error: 'No fields to update.' });
  }

  fields.push(`updated_at = NOW()`);
  values.push(id, tenantId);

  const result = await query(
    `UPDATE hr_projects SET ${fields.join(', ')} WHERE id = $${paramIdx++} AND tenant_id = $${paramIdx} RETURNING *`,
    values,
    tenantId
  );

  if (!result.rows[0]) {
    return res.status(404).json({ error: 'Project not found.' });
  }

  res.json({ project: result.rows[0] });
});

// ── DELETE PROJECT ──
router.delete('/projects/:id', authenticate, authorize('admin'), async (req, res) => {
  const { tenantId } = req.user;
  const { id } = req.params;

  await query(`DELETE FROM hr_projects WHERE id = $1 AND tenant_id = $2`, [id, tenantId], tenantId);
  res.json({ message: 'Project deleted.' });
});

// ═══════════════════════════════════════════════════════
//  PROJECT MEMBERS
// ═══════════════════════════════════════════════════════

// ── ADD MEMBER TO PROJECT ──
router.post('/projects/:id/members', authenticate, authorize('admin', 'employee'), async (req, res) => {
  const { tenantId } = req.user;
  const projectId = req.params.id;
  const { employee_id, role, responsibilities } = req.body;

  if (!employee_id) {
    return res.status(400).json({ error: 'employee_id is required.' });
  }

  // Verify project belongs to tenant
  const projCheck = await query(
    `SELECT id FROM hr_projects WHERE id = $1 AND tenant_id = $2`,
    [projectId, tenantId],
    tenantId
  );
  if (!projCheck.rows[0]) {
    return res.status(404).json({ error: 'Project not found.' });
  }

  // Verify employee belongs to tenant
  const empCheck = await query(
    `SELECT id FROM hr_employees WHERE id = $1 AND tenant_id = $2`,
    [employee_id, tenantId],
    tenantId
  );
  if (!empCheck.rows[0]) {
    return res.status(404).json({ error: 'Employee not found.' });
  }

  try {
    const result = await query(
      `INSERT INTO hr_project_members (project_id, employee_id, role, responsibilities)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [projectId, employee_id, role || 'member', responsibilities || null],
      tenantId
    );
    res.status(201).json({ member: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Employee is already a member of this project.' });
    }
    throw err;
  }
});

// ── REMOVE MEMBER FROM PROJECT ──
router.delete('/projects/:projectId/members/:memberId', authenticate, authorize('admin'), async (req, res) => {
  const { tenantId } = req.user;
  const { projectId, memberId } = req.params;

  // Verify project belongs to tenant
  const projCheck = await query(
    `SELECT id FROM hr_projects WHERE id = $1 AND tenant_id = $2`,
    [projectId, tenantId],
    tenantId
  );
  if (!projCheck.rows[0]) {
    return res.status(404).json({ error: 'Project not found.' });
  }

  await query(`DELETE FROM hr_project_members WHERE id = $1 AND project_id = $2`, [memberId, projectId], tenantId);
  res.json({ message: 'Member removed from project.' });
});

// ═══════════════════════════════════════════════════════
//  PROJECT UPDATES
// ═══════════════════════════════════════════════════════

// ── SUBMIT PROJECT UPDATE ──
router.post('/projects/:id/updates', authenticate, authorize('admin', 'employee'), async (req, res) => {
  const { tenantId } = req.user;
  const projectId = req.params.id;
  const { submitted_by, progress_pct, notes, blockers } = req.body;

  if (!submitted_by || !notes) {
    return res.status(400).json({ error: 'submitted_by and notes are required.' });
  }

  // Verify project belongs to tenant
  const projCheck = await query(
    `SELECT id FROM hr_projects WHERE id = $1 AND tenant_id = $2`,
    [projectId, tenantId],
    tenantId
  );
  if (!projCheck.rows[0]) {
    return res.status(404).json({ error: 'Project not found.' });
  }

  const result = await query(
    `INSERT INTO hr_project_updates (project_id, submitted_by, progress_pct, notes, blockers)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [projectId, submitted_by, progress_pct != null ? progress_pct : null, notes, blockers || null],
    tenantId
  );

  // Also update the project's current_progress and last_update fields
  if (progress_pct != null) {
    await query(
      `UPDATE hr_projects SET current_progress = $1, last_update_summary = $2, last_update_at = NOW(), updated_at = NOW()
       WHERE id = $3 AND tenant_id = $4`,
      [progress_pct, notes.substring(0, 200), projectId, tenantId],
      tenantId
    );
  } else {
    await query(
      `UPDATE hr_projects SET last_update_summary = $1, last_update_at = NOW(), updated_at = NOW()
       WHERE id = $2 AND tenant_id = $3`,
      [notes.substring(0, 200), projectId, tenantId],
      tenantId
    );
  }

  res.status(201).json({ update: result.rows[0] });
});

// ── GET PROJECT UPDATES ──
router.get('/projects/:id/updates', authenticate, authorize('admin', 'employee', 'reviewer'), async (req, res) => {
  const { tenantId } = req.user;
  const projectId = req.params.id;

  // Verify project belongs to tenant
  const projCheck = await query(
    `SELECT id FROM hr_projects WHERE id = $1 AND tenant_id = $2`,
    [projectId, tenantId],
    tenantId
  );
  if (!projCheck.rows[0]) {
    return res.status(404).json({ error: 'Project not found.' });
  }

  const result = await query(
    `SELECT u.*, e.name as submitted_by_name, e.position as submitted_by_position
     FROM hr_project_updates u
     JOIN hr_employees e ON u.submitted_by = e.id
     WHERE u.project_id = $1
     ORDER BY u.created_at DESC`,
    [projectId],
    tenantId
  );

  res.json({ updates: result.rows });
});

// ── CHECK PROJECT PACING (proxy to agent) ──
router.post('/projects/check-pacing', authenticate, authorize('admin', 'employee'), async (req, res) => {
  const { tenantId } = req.user;

  try {
    const agentUrl = process.env.AGENT_SERVICE_URL || 'http://localhost:8000';
    const response = await fetch(`${agentUrl}/agent/hr/check-project-pacing`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Token': process.env.INTERNAL_SERVICE_TOKEN,
      },
      body: JSON.stringify({ tenant_id: tenantId }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Agent pacing check failed: ${errorText}`);
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error checking project pacing:', error);
    res.status(500).json({ error: 'Failed to check project pacing.' });
  }
});

// ── MULTER ERROR HANDLER ──
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || err.message.includes('Unsupported file type')) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

module.exports = router;
