const express = require('express');
const router = express.Router();
const multer = require('multer');
const { randomUUID } = require('crypto');
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const { ingestDocument, ingestLink, ingestSite } = require('../services/ingestion');

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
      'text/markdown',
      'text/plain',
      'image/png',
      'image/jpeg',
      'image/webp'
    ];
    if (allowed.includes(file.mimetype) || file.originalname.endsWith('.md')) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type. Allowed: PDF, DOCX, MD, PNG, JPG, WEBP.'));
    }
  },
});

// ── UPLOAD A DOCUMENT ──
// Admins can upload; reviewers are read-only.
router.post(
  '/',
  authenticate,
  authorize('admin'),
  upload.single('file'),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    const { tenantId } = req.user;
    let { buffer, originalname, mimetype } = req.file;

    // Handle .md files that might upload as text/plain or octet-stream
    if (originalname.endsWith('.md')) mimetype = 'text/markdown';

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

// ── INGEST A LINK OR ENTIRE SITE VIA SITEMAP ──
router.post(
  '/link',
  authenticate,
  authorize('admin'),
  async (req, res) => {
    const { url, crawlEntireSite, maxPages } = req.body;
    if (!url) {
      return res.status(400).json({ error: 'No URL provided.' });
    }

    const { tenantId } = req.user;

    try {
      if (crawlEntireSite) {
        const rootDocumentId = randomUUID();

        // 1. Create root document record immediately with status 'processing'
        await query(
          `INSERT INTO documents (id, tenant_id, filename, mime_type, status)
           VALUES ($1, $2, $3, $4, 'processing')`,
          [rootDocumentId, tenantId, `${url} (Site Crawl)`, 'text/html'],
          tenantId
        );

        // 2. Audit log crawl initiation
        await query(
          `INSERT INTO audit_logs (tenant_id, event_type, payload)
           VALUES ($1, 'site_crawl_initiated', $2)`,
          [
            tenantId,
            JSON.stringify({
              documentId: rootDocumentId,
              url,
              maxPages: Number(maxPages) || 30,
            }),
          ],
          tenantId
        );

        // 3. Dispatch crawl in background without blocking HTTP response
        setImmediate(() => {
          ingestSite({
            rootDocumentId,
            url,
            tenantId,
            maxPages: Number(maxPages) || 30,
          }).catch((bgErr) => {
            console.error(`[Background Site Crawl Failure] ${url}:`, bgErr);
          });
        });

        // 4. Return 202 Accepted immediately
        return res.status(202).json({
          site: true,
          status: 'processing',
          documentId: rootDocumentId,
          message: 'Website crawl started in background. Status will update dynamically.',
        });
      }

      const result = await ingestLink({
        url,
        tenantId,
      });

      await query(
        `INSERT INTO audit_logs (tenant_id, event_type, payload)
         VALUES ($1, 'link_ingested', $2)`,
        [tenantId, JSON.stringify({ documentId: result.documentId, url })],
        tenantId
      );

      res.status(201).json({ document: result });
    } catch (err) {
      console.error(`[Link Ingestion Route Error] ${url}:`, err);
      res.status(400).json({ error: err.message || 'Failed to ingest link or website.' });
    }
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
