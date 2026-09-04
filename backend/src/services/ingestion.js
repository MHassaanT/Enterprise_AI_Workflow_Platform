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
    const causeMsg = err.cause?.message || err.cause?.code || '';
    const errorDetails = causeMsg ? `${err.message} (${causeMsg})` : err.message;
    console.error(`[Ingestion Error] Document ${documentId} (${filename}) failed:`, err);

    await query(
      `UPDATE documents SET status = 'failed', error_message = $1 WHERE id = $2 AND tenant_id = $3`,
      [errorDetails, documentId, tenantId],
      tenantId
    );

    try {
      await deleteDocumentChunks(documentId, tenantId);
    } catch {
      // Best-effort cleanup
    }

    throw new Error(errorDetails);
  }
};

const ingestLink = async ({ url, tenantId }) => {
  const documentId = randomUUID();

  // Record document as processing
  await query(
    `INSERT INTO documents (id, tenant_id, filename, mime_type, status)
     VALUES ($1, $2, $3, $4, 'processing')`,
    [documentId, tenantId, url, 'text/html'],
    tenantId
  );

  try {
    // 1. Call Python agent to scrape
    const agentUrl = process.env.AGENT_SERVICE_URL || 'http://localhost:8000';
    const agentResponse = await fetch(`${agentUrl}/agent/tools/scrape`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    
    if (!agentResponse.ok) {
      const errText = await agentResponse.text();
      throw new Error(`Scraping failed: ${errText}`);
    }

    const { markdown } = await agentResponse.json();
    if (!markdown) {
      throw new Error('No markdown returned from scraper.');
    }

    // 2. Treat the markdown as a 1-page document
    const extracted = {
      text: markdown,
      pages: [{ page: 1, text: markdown }],
      pageCount: 1,
    };

    const chunks = chunkDocument({
      text: extracted.text,
      pages: extracted.pages,
      documentId,
      documentName: url,
      tenantId,
    });

    if (chunks.length === 0) {
      throw new Error('No text could be extracted from the URL.');
    }

    // 3. Embed and upsert
    const texts = chunks.map((c) => c.text);
    const vectors = await embedDocumentChunks(texts);
    await upsertChunks(chunks, vectors);

    // 4. Update status
    await query(
      `UPDATE documents SET status = 'ready', chunk_count = $1 WHERE id = $2 AND tenant_id = $3`,
      [chunks.length, documentId, tenantId],
      tenantId
    );

    return {
      documentId,
      filename: url,
      chunkCount: chunks.length,
      pageCount: extracted.pageCount,
      status: 'ready',
    };
  } catch (err) {
    const errorDetails = err.message;
    console.error(`[Ingestion Error] Link ${documentId} (${url}) failed:`, err);

    await query(
      `UPDATE documents SET status = 'failed', error_message = $1 WHERE id = $2 AND tenant_id = $3`,
      [errorDetails, documentId, tenantId],
      tenantId
    );

    try {
      await deleteDocumentChunks(documentId, tenantId);
    } catch {
      // Best-effort cleanup
    }

    throw new Error(errorDetails);
  }
};

const ingestSite = async ({ rootDocumentId, url, tenantId, maxPages = 30 }) => {
  const agentUrl = process.env.AGENT_SERVICE_URL || 'http://localhost:8000';

  try {
    // 1. Request LLM-curated sitemap scraping from Python agent
    let agentResponse;
    try {
      agentResponse = await fetch(`${agentUrl}/agent/tools/scrape-site`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, max_pages: maxPages }),
      });
    } catch (netErr) {
      throw new Error(`Failed connecting to agent crawler service: ${netErr.message}`);
    }

    if (!agentResponse.ok) {
      const errText = await agentResponse.text();
      throw new Error(`Website crawling failed (${agentResponse.status}): ${errText}`);
    }

    const agentData = await agentResponse.json();
    const pages = agentData.pages || [];

    if (pages.length === 0) {
      throw new Error('No content could be extracted from any pages on this website.');
    }

    const ingestedPages = [];
    let totalChunksIngested = 0;

    // 2. Index each scraped page into PostgreSQL & Qdrant
    for (const page of pages) {
      const pageUrl = page.url;
      const markdown = page.markdown || '';
      if (!markdown || markdown.trim().length < 20) {
        continue;
      }

      const documentId = randomUUID();

      try {
        await query(
          `INSERT INTO documents (id, tenant_id, filename, mime_type, status)
           VALUES ($1, $2, $3, $4, 'processing')`,
          [documentId, tenantId, pageUrl, 'text/html'],
          tenantId
        );

        const extracted = {
          text: markdown,
          pages: [{ page: 1, text: markdown }],
          pageCount: 1,
        };

        const chunks = chunkDocument({
          text: extracted.text,
          pages: extracted.pages,
          documentId,
          documentName: pageUrl,
          tenantId,
        });

        if (chunks.length === 0) {
          throw new Error('No text chunks extracted.');
        }

        const texts = chunks.map((c) => c.text);
        const vectors = await embedDocumentChunks(texts);
        await upsertChunks(chunks, vectors);

        await query(
          `UPDATE documents SET status = 'ready', chunk_count = $1 WHERE id = $2 AND tenant_id = $3`,
          [chunks.length, documentId, tenantId],
          tenantId
        );

        totalChunksIngested += chunks.length;
        ingestedPages.push({
          documentId,
          url: pageUrl,
          title: page.title,
          chunkCount: chunks.length,
          status: 'ready',
        });
      } catch (pageErr) {
        console.warn(`[Ingestion Warning] Subpage ${pageUrl} failed indexing:`, pageErr.message);
        await query(
          `UPDATE documents SET status = 'failed', error_message = $1 WHERE id = $2 AND tenant_id = $3`,
          [pageErr.message, documentId, tenantId],
          tenantId
        ).catch(() => {});
        try {
          await deleteDocumentChunks(documentId, tenantId);
        } catch {}
      }
    }

    if (ingestedPages.length === 0) {
      throw new Error('Failed to index any of the discovered website pages.');
    }

    // 3. Mark root document ready upon completion
    if (rootDocumentId) {
      await query(
        `UPDATE documents SET status = 'ready', chunk_count = $1 WHERE id = $2 AND tenant_id = $3`,
        [totalChunksIngested, rootDocumentId, tenantId],
        tenantId
      );
    }

    return {
      siteUrl: url,
      totalDiscovered: agentData.total_discovered,
      totalCurated: agentData.total_curated,
      totalIngested: ingestedPages.length,
      totalChunks: totalChunksIngested,
      pages: ingestedPages,
    };
  } catch (siteErr) {
    console.error(`[Background Site Crawl Error] ${url}:`, siteErr);
    if (rootDocumentId) {
      await query(
        `UPDATE documents SET status = 'failed', error_message = $1 WHERE id = $2 AND tenant_id = $3`,
        [siteErr.message, rootDocumentId, tenantId],
        tenantId
      ).catch(() => {});
    }
    throw siteErr;
  }
};

module.exports = { ingestDocument, ingestLink, ingestSite };
