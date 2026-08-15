const express = require('express');
const router = express.Router();
const multer = require('multer');
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const { extractText } = require('../services/extraction');
const { chunkDocument } = require('../services/chunking');
const { embedDocumentChunks } = require('../services/embeddings');
const { upsertResumeChunks, deleteJobDescriptionResumes, deleteResumeChunks } = require('../services/hrQdrant');

// ── MULTER CONFIG ──
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type. Only PDF and DOCX are allowed.'));
    }
  },
});

// ── CREATE JOB DESCRIPTION ──
router.post('/job-descriptions', authenticate, authorize('admin', 'employee'), async (req, res) => {
  const { tenantId } = req.user;
  const { title, description, requirements } = req.body;

  if (!title || !description) {
    return res.status(400).json({ error: 'Title and description are required.' });
  }

  const result = await query(
    `INSERT INTO hr_job_descriptions (tenant_id, title, description, requirements)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [tenantId, title, description, requirements || null],
    tenantId
  );

  res.status(201).json({ jobDescription: result.rows[0] });
});

// ── LIST JOB DESCRIPTIONS ──
router.get('/job-descriptions', authenticate, authorize('admin', 'employee', 'reviewer'), async (req, res) => {
  const { tenantId } = req.user;

  const result = await query(
    `SELECT jd.id, jd.title, jd.status, jd.created_at, 
            COUNT(r.id) as resume_count
     FROM hr_job_descriptions jd
     LEFT JOIN hr_resumes r ON jd.id = r.job_description_id
     WHERE jd.tenant_id = $1
     GROUP BY jd.id
     ORDER BY jd.created_at DESC`,
    [tenantId],
    tenantId
  );

  res.json({ jobDescriptions: result.rows });
});

// ── GET SINGLE JD WITH RESUMES ──
router.get('/job-descriptions/:id', authenticate, authorize('admin', 'employee', 'reviewer'), async (req, res) => {
  const { tenantId } = req.user;
  const { id } = req.params;

  const jdResult = await query(
    `SELECT * FROM hr_job_descriptions WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId],
    tenantId
  );

  if (!jdResult.rows[0]) {
    return res.status(404).json({ error: 'Job description not found.' });
  }

  const resumesResult = await query(
    `SELECT * FROM hr_resumes WHERE job_description_id = $1 AND tenant_id = $2 ORDER BY created_at DESC`,
    [id, tenantId],
    tenantId
  );

  res.json({
    jobDescription: jdResult.rows[0],
    resumes: resumesResult.rows,
  });
});

// ── UPLOAD RESUMES ──
router.post('/job-descriptions/:id/resumes', authenticate, authorize('admin', 'employee'), upload.array('files', 10), async (req, res) => {
  const { tenantId } = req.user;
  const jobDescriptionId = req.params.id;

  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded.' });
  }

  // Verify JD exists
  const jdResult = await query(
    `SELECT id FROM hr_job_descriptions WHERE id = $1 AND tenant_id = $2`,
    [jobDescriptionId, tenantId],
    tenantId
  );

  if (!jdResult.rows[0]) {
    return res.status(404).json({ error: 'Job description not found.' });
  }

  const uploadedResumes = [];
  
  // Process each resume
  for (const file of req.files) {
    const { buffer, originalname, mimetype } = file;
    
    // Insert pending record
    const resumeResult = await query(
      `INSERT INTO hr_resumes (tenant_id, job_description_id, filename, mime_type, status, candidate_name)
       VALUES ($1, $2, $3, $4, 'processing', $5) RETURNING id`,
      [tenantId, jobDescriptionId, originalname, mimetype, originalname.split('.')[0]],
      tenantId
    );
    
    const resumeId = resumeResult.rows[0].id;
    uploadedResumes.push({ id: resumeId, filename: originalname, status: 'processing' });
    
    // Process asynchronously (fire and forget for now, realistically should be a worker)
    (async () => {
      try {
        const extracted = await extractText(buffer, mimetype);
        const chunks = chunkDocument({
          text: extracted.text,
          pages: extracted.pages,
          documentId: resumeId,
          documentName: originalname,
          tenantId,
        });

        if (chunks.length === 0) {
          throw new Error('No text extracted.');
        }
        
        // Add specific metadata for HR search
        chunks.forEach(c => {
          c.metadata.resume_id = resumeId;
          c.metadata.job_description_id = jobDescriptionId;
          c.metadata.candidate_name = originalname.split('.')[0]; // Fallback name
        });

        const texts = chunks.map((c) => c.text);
        const vectors = await embedDocumentChunks(texts);
        await upsertResumeChunks(chunks, vectors);

        await query(
          `UPDATE hr_resumes SET status = 'ready', chunk_count = $1 WHERE id = $2 AND tenant_id = $3`,
          [chunks.length, resumeId, tenantId],
          tenantId
        );
      } catch (err) {
        console.error(`[HR Ingestion Error] Resume ${resumeId} failed:`, err);
        await query(
          `UPDATE hr_resumes SET status = 'failed', error_message = $1 WHERE id = $2 AND tenant_id = $3`,
          [err.message, resumeId, tenantId],
          tenantId
        );
      }
    })();
  }

  res.status(202).json({ resumes: uploadedResumes, message: 'Resumes are being processed.' });
});

// ── RANK CANDIDATES (PROXY TO AGENT) ──
router.post('/job-descriptions/:id/rank', authenticate, authorize('admin', 'employee'), async (req, res) => {
  const { tenantId } = req.user;
  const jobDescriptionId = req.params.id;

  // Verify JD
  const jdResult = await query(
    `SELECT id, title, description, requirements FROM hr_job_descriptions WHERE id = $1 AND tenant_id = $2`,
    [jobDescriptionId, tenantId],
    tenantId
  );

  if (!jdResult.rows[0]) {
    return res.status(404).json({ error: 'Job description not found.' });
  }

  // Get ready resumes
  const resumesResult = await query(
    `SELECT id FROM hr_resumes WHERE job_description_id = $1 AND tenant_id = $2 AND status = 'ready'`,
    [jobDescriptionId, tenantId],
    tenantId
  );

  if (resumesResult.rows.length === 0) {
    return res.status(400).json({ error: 'No ready resumes to rank.' });
  }
  
  const resumeIds = resumesResult.rows.map(r => r.id);

  try {
    // Call Python agent
    const agentUrl = process.env.AGENT_SERVICE_URL || 'http://localhost:8000';
    const response = await fetch(`${agentUrl}/agent/hr/rank`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Token': process.env.INTERNAL_SERVICE_TOKEN,
      },
      body: JSON.stringify({
        tenant_id: tenantId,
        job_description_id: jobDescriptionId,
        job_title: jdResult.rows[0].title,
        job_description: jdResult.rows[0].description,
        job_requirements: jdResult.rows[0].requirements || '',
        resume_ids: resumeIds
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Agent ranking failed: ${errorText}`);
    }

    const data = await response.json();
    
    // Fetch the updated resumes to return
    const updatedResumesResult = await query(
      `SELECT * FROM hr_resumes WHERE job_description_id = $1 AND tenant_id = $2 ORDER BY rank_score DESC NULLS LAST`,
      [jobDescriptionId, tenantId],
      tenantId
    );

    res.json({ ranked_resumes: updatedResumesResult.rows });
  } catch (error) {
    console.error('Error triggering HR ranking:', error);
    res.status(500).json({ error: 'Failed to rank candidates.' });
  }
});

// ── SCHEDULE INTERVIEW (PROXY TO AGENT) ──
router.post('/schedule-interview', authenticate, authorize('admin', 'employee'), async (req, res) => {
  const { tenantId } = req.user;
  const { candidateIds, interviewDetails } = req.body; // candidateIds are resume_ids
  
  if (!candidateIds || !candidateIds.length || !interviewDetails) {
    return res.status(400).json({ error: 'candidateIds and interviewDetails are required.' });
  }

  try {
    // Call Python agent
    const agentUrl = process.env.AGENT_SERVICE_URL || 'http://localhost:8000';
    const response = await fetch(`${agentUrl}/agent/hr/send-emails`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Token': process.env.INTERNAL_SERVICE_TOKEN,
      },
      body: JSON.stringify({
        tenant_id: tenantId,
        candidate_ids: candidateIds,
        interview_details: interviewDetails
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Agent email sending failed: ${errorText}`);
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error scheduling interviews:', error);
    res.status(500).json({ error: 'Failed to schedule interviews.' });
  }
});

// ── DELETE JOB DESCRIPTION ──
router.delete('/job-descriptions/:id', authenticate, authorize('admin'), async (req, res) => {
  const { tenantId } = req.user;
  const { id } = req.params;

  // Clean up vectors
  await deleteJobDescriptionResumes(id, tenantId);

  // DB cascades delete to hr_resumes
  await query(
    `DELETE FROM hr_job_descriptions WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId],
    tenantId
  );

  res.json({ message: 'Job description deleted successfully.' });
});

// ── DELETE RESUME ──
router.delete('/resumes/:id', authenticate, authorize('admin'), async (req, res) => {
  const { tenantId } = req.user;
  const { id } = req.params;

  await deleteResumeChunks(id, tenantId);
  await query(`DELETE FROM hr_resumes WHERE id = $1 AND tenant_id = $2`, [id, tenantId], tenantId);

  res.json({ message: 'Resume deleted.' });
});

// ═══════════════════════════════════════════════════════
//  OPEN ROLES (Email Intake)
// ═══════════════════════════════════════════════════════

// ── CREATE OPEN ROLE ──
router.post('/open-roles', authenticate, authorize('admin', 'employee'), async (req, res) => {
  const { tenantId } = req.user;
  const { title, description, requirements, accepting_until, search_query } = req.body;

  if (!title || !description || !accepting_until) {
    return res.status(400).json({ error: 'title, description, and accepting_until are required.' });
  }

  const result = await query(
    `INSERT INTO hr_open_roles (tenant_id, title, description, requirements, accepting_until, search_query)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [tenantId, title, description, requirements || null, accepting_until, search_query || 'subject:job application'],
    tenantId
  );

  // After creating a new role, trigger talent pool scan (fire and forget)
  (async () => {
    try {
      const agentUrl = process.env.AGENT_SERVICE_URL || 'http://localhost:8000';
      await fetch(`${agentUrl}/agent/hr/scan-talent-pool`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Token': process.env.INTERNAL_SERVICE_TOKEN,
        },
        body: JSON.stringify({
          tenant_id: tenantId,
          open_role_id: result.rows[0].id,
          role_title: title,
          role_description: description,
          role_requirements: requirements || '',
        }),
      });
    } catch (err) {
      console.error('[HR] Failed to trigger talent pool scan:', err.message);
    }
  })();

  res.status(201).json({ openRole: result.rows[0] });
});

// ── LIST OPEN ROLES ──
router.get('/open-roles', authenticate, authorize('admin', 'employee', 'reviewer'), async (req, res) => {
  const { tenantId } = req.user;

  const result = await query(
    `SELECT r.*,
            COALESCE(
              (SELECT COUNT(*) FROM hr_applications a WHERE a.open_role_id = r.id), 0
            )::int as application_count
     FROM hr_open_roles r
     WHERE r.tenant_id = $1
     ORDER BY r.created_at DESC`,
    [tenantId],
    tenantId
  );

  res.json({ openRoles: result.rows });
});

// ── GET SINGLE OPEN ROLE WITH APPLICATIONS ──
router.get('/open-roles/:id', authenticate, authorize('admin', 'employee', 'reviewer'), async (req, res) => {
  const { tenantId } = req.user;
  const { id } = req.params;

  const roleResult = await query(
    `SELECT * FROM hr_open_roles WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId],
    tenantId
  );

  if (!roleResult.rows[0]) {
    return res.status(404).json({ error: 'Open role not found.' });
  }

  const appsResult = await query(
    `SELECT * FROM hr_applications WHERE open_role_id = $1 AND tenant_id = $2 ORDER BY rank_score DESC NULLS LAST, created_at DESC`,
    [id, tenantId],
    tenantId
  );

  res.json({
    openRole: roleResult.rows[0],
    applications: appsResult.rows,
  });
});

// ── UPDATE OPEN ROLE ──
router.patch('/open-roles/:id', authenticate, authorize('admin'), async (req, res) => {
  const { tenantId } = req.user;
  const { id } = req.params;
  const { title, description, requirements, accepting_until, search_query, status } = req.body;

  const fields = [];
  const values = [];
  let paramIdx = 1;

  if (title !== undefined) { fields.push(`title = $${paramIdx++}`); values.push(title); }
  if (description !== undefined) { fields.push(`description = $${paramIdx++}`); values.push(description); }
  if (requirements !== undefined) { fields.push(`requirements = $${paramIdx++}`); values.push(requirements); }
  if (accepting_until !== undefined) { fields.push(`accepting_until = $${paramIdx++}`); values.push(accepting_until); }
  if (search_query !== undefined) { fields.push(`search_query = $${paramIdx++}`); values.push(search_query); }
  if (status !== undefined) { fields.push(`status = $${paramIdx++}`); values.push(status); }

  if (fields.length === 0) {
    return res.status(400).json({ error: 'No fields to update.' });
  }

  fields.push(`updated_at = NOW()`);
  values.push(id, tenantId);

  const result = await query(
    `UPDATE hr_open_roles SET ${fields.join(', ')} WHERE id = $${paramIdx++} AND tenant_id = $${paramIdx} RETURNING *`,
    values,
    tenantId
  );

  if (!result.rows[0]) {
    return res.status(404).json({ error: 'Open role not found.' });
  }

  res.json({ openRole: result.rows[0] });
});

// ── DELETE OPEN ROLE ──
router.delete('/open-roles/:id', authenticate, authorize('admin'), async (req, res) => {
  const { tenantId } = req.user;
  const { id } = req.params;

  await query(`DELETE FROM hr_open_roles WHERE id = $1 AND tenant_id = $2`, [id, tenantId], tenantId);
  res.json({ message: 'Open role deleted.' });
});

// ── RANK APPLICATIONS FOR A ROLE (proxy to agent) ──
router.post('/open-roles/:id/rank', authenticate, authorize('admin', 'employee'), async (req, res) => {
  const { tenantId } = req.user;
  const roleId = req.params.id;

  const roleResult = await query(
    `SELECT * FROM hr_open_roles WHERE id = $1 AND tenant_id = $2`,
    [roleId, tenantId],
    tenantId
  );

  if (!roleResult.rows[0]) {
    return res.status(404).json({ error: 'Open role not found.' });
  }

  const appsResult = await query(
    `SELECT id FROM hr_applications WHERE open_role_id = $1 AND tenant_id = $2 AND status IN ('received', 'ready')`,
    [roleId, tenantId],
    tenantId
  );

  if (appsResult.rows.length === 0) {
    return res.status(400).json({ error: 'No applications to rank.' });
  }

  try {
    const agentUrl = process.env.AGENT_SERVICE_URL || 'http://localhost:8000';
    const response = await fetch(`${agentUrl}/agent/hr/rank-applications`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Token': process.env.INTERNAL_SERVICE_TOKEN,
      },
      body: JSON.stringify({
        tenant_id: tenantId,
        open_role_id: roleId,
        role_title: roleResult.rows[0].title,
        role_description: roleResult.rows[0].description,
        role_requirements: roleResult.rows[0].requirements || '',
        application_ids: appsResult.rows.map(r => r.id),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Agent ranking failed: ${errorText}`);
    }

    const data = await response.json();

    // Fetch updated applications
    const updatedApps = await query(
      `SELECT * FROM hr_applications WHERE open_role_id = $1 AND tenant_id = $2 ORDER BY rank_score DESC NULLS LAST`,
      [roleId, tenantId],
      tenantId
    );

    res.json({ ranked_applications: updatedApps.rows });
  } catch (error) {
    console.error('Error ranking applications:', error);
    res.status(500).json({ error: 'Failed to rank applications.' });
  }
});

// ── SCAN TALENT POOL (proxy to agent) ──
router.post('/open-roles/:id/scan-pool', authenticate, authorize('admin', 'employee'), async (req, res) => {
  const { tenantId } = req.user;
  const roleId = req.params.id;

  const roleResult = await query(
    `SELECT * FROM hr_open_roles WHERE id = $1 AND tenant_id = $2`,
    [roleId, tenantId],
    tenantId
  );

  if (!roleResult.rows[0]) {
    return res.status(404).json({ error: 'Open role not found.' });
  }

  try {
    const agentUrl = process.env.AGENT_SERVICE_URL || 'http://localhost:8000';
    const response = await fetch(`${agentUrl}/agent/hr/scan-talent-pool`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Token': process.env.INTERNAL_SERVICE_TOKEN,
      },
      body: JSON.stringify({
        tenant_id: tenantId,
        open_role_id: roleId,
        role_title: roleResult.rows[0].title,
        role_description: roleResult.rows[0].description,
        role_requirements: roleResult.rows[0].requirements || '',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Talent pool scan failed: ${errorText}`);
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error scanning talent pool:', error);
    res.status(500).json({ error: 'Failed to scan talent pool.' });
  }
});

// ═══════════════════════════════════════════════════════
//  TALENT POOL ("Future Prospects")
// ═══════════════════════════════════════════════════════

// ── LIST TALENT POOL ──
router.get('/talent-pool', authenticate, authorize('admin', 'employee', 'reviewer'), async (req, res) => {
  const { tenantId } = req.user;

  const result = await query(
    `SELECT * FROM hr_talent_pool WHERE tenant_id = $1 ORDER BY created_at DESC`,
    [tenantId],
    tenantId
  );

  res.json({ prospects: result.rows });
});

// ── DELETE TALENT POOL ENTRY ──
router.delete('/talent-pool/:id', authenticate, authorize('admin'), async (req, res) => {
  const { tenantId } = req.user;
  const { id } = req.params;

  await query(`DELETE FROM hr_talent_pool WHERE id = $1 AND tenant_id = $2`, [id, tenantId], tenantId);
  res.json({ message: 'Prospect removed from talent pool.' });
});

// ── MULTER ERROR HANDLER ──
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || err.message.includes('Unsupported file type')) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

module.exports = router;
