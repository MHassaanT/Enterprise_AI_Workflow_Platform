const { QdrantClient } = require('@qdrant/js-client-rest');
const { randomUUID } = require('crypto');
const { EMBEDDING_DIMENSION } = require('./embeddings');

const COLLECTION_NAME = process.env.QDRANT_COLLECTION || 'document_chunks';

let client = null;

const getClient = () => {
  if (!client) {
    client = new QdrantClient({
      url: process.env.QDRANT_URL || 'http://localhost:6333',
      apiKey: process.env.QDRANT_API_KEY || undefined,
    });
  }
  return client;
};

const ensureCollection = async () => {
  const qdrant = getClient();
  const collections = await qdrant.getCollections();
  const exists = collections.collections.some((c) => c.name === COLLECTION_NAME);

  if (!exists) {
    await qdrant.createCollection(COLLECTION_NAME, {
      vectors: {
        size: EMBEDDING_DIMENSION,
        distance: 'Cosine',
      },
    });

    // Index tenant_id for fast filtered search
    await qdrant.createPayloadIndex(COLLECTION_NAME, {
      field_name: 'tenant_id',
      field_schema: 'keyword',
    });

    await qdrant.createPayloadIndex(COLLECTION_NAME, {
      field_name: 'document_id',
      field_schema: 'keyword',
    });
  }
};

const upsertChunks = async (chunks, vectors) => {
  const qdrant = getClient();
  await ensureCollection();

  const points = chunks.map((chunk, i) => ({
    id: randomUUID(),
    vector: vectors[i],
    payload: {
      text: chunk.text,
      ...chunk.metadata,
    },
  }));

  // Batch upsert in groups of 50
  const batchSize = 50;
  for (let i = 0; i < points.length; i += batchSize) {
    const batch = points.slice(i, i + batchSize);
    await qdrant.upsert(COLLECTION_NAME, { wait: true, points: batch });
  }

  return points.length;
};

const searchByTenant = async (queryVector, tenantId, { limit = 5, scoreThreshold = 0.5 } = {}) => {
  const qdrant = getClient();
  await ensureCollection();

  const results = await qdrant.search(COLLECTION_NAME, {
    vector: queryVector,
    limit,
    score_threshold: scoreThreshold,
    with_payload: true,
    filter: {
      must: [
        {
          key: 'tenant_id',
          match: { value: tenantId },
        },
      ],
    },
  });

  return results.map((hit) => ({
    score: hit.score,
    text: hit.payload.text,
    documentId: hit.payload.document_id,
    documentName: hit.payload.document_name,
    section: hit.payload.section,
    page: hit.payload.page,
    chunkIndex: hit.payload.chunk_index,
  }));
};

const deleteDocumentChunks = async (documentId, tenantId) => {
  const qdrant = getClient();
  await ensureCollection();

  await qdrant.delete(COLLECTION_NAME, {
    wait: true,
    filter: {
      must: [
        { key: 'document_id', match: { value: documentId } },
        { key: 'tenant_id', match: { value: tenantId } },
      ],
    },
  });
};

module.exports = {
  ensureCollection,
  upsertChunks,
  searchByTenant,
  deleteDocumentChunks,
  COLLECTION_NAME,
};
