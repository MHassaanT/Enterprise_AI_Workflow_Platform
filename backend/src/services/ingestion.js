const { randomUUID } = require('crypto');
const { query } = require('../db');
const { extractText } = require('./extraction');
const { chunkDocument } = require('./chunking');
const { embedDocumentChunks } = require('./embeddings');
const { upsertChunks, deleteDocumentChunks } = require('./qdrant');

const ingestDocument = async ({ buffer, filename, mimetype, tenantId }) => {
  const documentId = randomUUID();

  // Record document as processing
  await query(
    `INSERT INTO documents (id, tenant_id, filename, mime_type, status)
     VALUES ($1, $2, $3, $4, 'processing')`,
    [documentId, tenantId, filename, mimetype],
    tenantId
  );

  try {
    const extracted = await extractText(buffer, mimetype);

    const chunks = chunkDocument({
      text: extracted.text,
      pages: extracted.pages,
      documentId,
      documentName: filename,
      tenantId,
    });

    if (chunks.length === 0) {
      throw new Error('No text could be extracted from the document.');
    }

    const texts = chunks.map((c) => c.text);
    const vectors = await embedDocumentChunks(texts);
    await upsertChunks(chunks, vectors);

    await query(
      `UPDATE documents SET status = 'ready', chunk_count = $1 WHERE id = $2 AND tenant_id = $3`,
      [chunks.length, documentId, tenantId],
      tenantId
    );

    return {
      documentId,
      filename,
      chunkCount: chunks.length,
      pageCount: extracted.pageCount,
      status: 'ready',
    };
  } catch (err) {
    await query(
      `UPDATE documents SET status = 'failed', error_message = $1 WHERE id = $2 AND tenant_id = $3`,
      [err.message, documentId, tenantId],
      tenantId
    );

    try {
      await deleteDocumentChunks(documentId, tenantId);
    } catch {
      // Best-effort cleanup
    }

    throw err;
  }
};

module.exports = { ingestDocument };
