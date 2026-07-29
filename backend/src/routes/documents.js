const express = require('express');
const router = express.Router();
const multer = require('multer');
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const { ingestDocument } = require('../services/ingestion');

// ── MULTER CONFIG ──
// Store file in memory so we can pass the buffer directly to the ingestion pipeline.
// Max file size: 20 MB
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

// ── UPLOAD A DOCUMENT ──
// Admins and employees can upload; reviewers are read-only.
router.post(
  '/',
  authenticate,
  authorize('admin', 'employee'),
  upload.single('file'),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    const { tenantId } = req.user;
    const { buffer, originalname, mimetype } = req.file;

    // Run ingestion pipeline:
    //   extraction → chunking → embedding → qdrant upsert → postgres status update
    const result = await ingestDocument({
      buffer,
      filename: originalname,
      mimetype,
      tenantId,
    });

    // Audit log
    await query(
      `INSERT INTO audit_logs (tenant_id, event_type, payload)
       VALUES ($1, 'document_uploaded', $2)`,
      [tenantId, JSON.stringify({ documentId: result.documentId, filename: result.filename })],
      tenantId
    );

    res.status(201).json({ document: result });
  }
);

// ── LIST ALL DOCUMENTS FOR TENANT ──
router.get(
  '/',
  authenticate,
  authorize('admin', 'employee', 'reviewer'),
  async (req, res) => {
    const { tenantId } = req.user;

    const result = await query(
      `SELECT id, filename, mime_type, chunk_count, status, error_message, created_at
       FROM documents
       WHERE tenant_id = $1
       ORDER BY created_at DESC`,
      [tenantId],
      tenantId
    );

    res.json({ documents: result.rows });
  }
);

// ── GET A SINGLE DOCUMENT ──
router.get(
  '/:id',
  authenticate,
  authorize('admin', 'employee', 'reviewer'),
  async (req, res) => {
    const { tenantId } = req.user;
    const { id } = req.params;

    const result = await query(
      `SELECT id, filename, mime_type, chunk_count, status, error_message, created_at
       FROM documents
       WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
      tenantId
    );

    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Document not found.' });
    }

    res.json({ document: result.rows[0] });
  }
);

// ── DELETE A DOCUMENT ──
// Removes DB record + all Qdrant vectors for this document.
router.delete(
  '/:id',
  authenticate,
  authorize('admin'),
  async (req, res) => {
    const { tenantId } = req.user;
    const { id } = req.params;

    // Verify ownership before deletion
    const existing = await query(
      'SELECT id, filename FROM documents WHERE id = $1 AND tenant_id = $2',
      [id, tenantId],
      tenantId
    );

    if (!existing.rows[0]) {
      return res.status(404).json({ error: 'Document not found.' });
    }

    const { deleteDocumentChunks } = require('../services/qdrant');
    await deleteDocumentChunks(id, tenantId);

    await query(
      'DELETE FROM documents WHERE id = $1 AND tenant_id = $2',
      [id, tenantId],
      tenantId
    );

    await query(
      `INSERT INTO audit_logs (tenant_id, event_type, payload)
       VALUES ($1, 'document_deleted', $2)`,
      [tenantId, JSON.stringify({ documentId: id, filename: existing.rows[0].filename })],
      tenantId
    );

    res.json({ message: 'Document deleted successfully.' });
  }
);

// ── MULTER ERROR HANDLER ──
// Catches file size / type errors from multer before the global handler sees them.
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || err.message.includes('Unsupported file type')) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

module.exports = router;
