const { QdrantClient } = require('@qdrant/js-client-rest');
const { randomUUID } = require('crypto');
const { EMBEDDING_DIMENSION } = require('./embeddings');

const COLLECTION_NAME = process.env.QDRANT_HR_COLLECTION || 'hr_resumes';

let client = null;

const getClient = () => {
  if (!client) {
    client = new QdrantClient({
      url: process.env.QDRANT_URL || 'http://localhost:6333',
      apiKey: process.env.QDRANT_API_KEY || undefined,
      checkCompatibility: false,
    });
  }
  return client;
};

const ensureHRCollection = async () => {
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

    // Index tenant_id and job_description_id for fast filtered search
    await qdrant.createPayloadIndex(COLLECTION_NAME, {
      field_name: 'tenant_id',
      field_schema: 'keyword',
    });

    await qdrant.createPayloadIndex(COLLECTION_NAME, {
      field_name: 'job_description_id',
      field_schema: 'keyword',
    });
    
    await qdrant.createPayloadIndex(COLLECTION_NAME, {
      field_name: 'resume_id',
      field_schema: 'keyword',
    });
  }
};

const upsertResumeChunks = async (chunks, vectors) => {
  const qdrant = getClient();
  await ensureHRCollection();

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

const searchResumesForJD = async (queryVector, tenantId, jobDescriptionId, { limit = 20, scoreThreshold = 0.3 } = {}) => {
  const qdrant = getClient();
  await ensureHRCollection();

  const results = await qdrant.search(COLLECTION_NAME, {
    vector: queryVector,
    limit,
    score_threshold: scoreThreshold,
    with_payload: true,
    filter: {
      must: [
        { key: 'tenant_id', match: { value: tenantId } },
        { key: 'job_description_id', match: { value: jobDescriptionId } },
      ],
    },
  });

  return results.map((hit) => ({
    score: hit.score,
    text: hit.payload.text,
    resumeId: hit.payload.resume_id,
    candidateName: hit.payload.candidate_name,
    section: hit.payload.section,
    page: hit.payload.page,
    chunkIndex: hit.payload.chunk_index,
  }));
};

const getAllResumesForJD = async (tenantId, jobDescriptionId) => {
  const qdrant = getClient();
  await ensureHRCollection();

  const results = await qdrant.scroll(COLLECTION_NAME, {
    limit: 1000,
    with_payload: true,
    filter: {
      must: [
        { key: 'tenant_id', match: { value: tenantId } },
        { key: 'job_description_id', match: { value: jobDescriptionId } },
      ],
    },
  });

  return results.points.map((hit) => ({
    text: hit.payload.text,
    resumeId: hit.payload.resume_id,
    candidateName: hit.payload.candidate_name,
    chunkIndex: hit.payload.chunk_index,
  }));
};

const deleteResumeChunks = async (resumeId, tenantId) => {
  const qdrant = getClient();
  await ensureHRCollection();

  await qdrant.delete(COLLECTION_NAME, {
    wait: true,
    filter: {
      must: [
        { key: 'resume_id', match: { value: resumeId } },
        { key: 'tenant_id', match: { value: tenantId } },
      ],
    },
  });
};

const deleteJobDescriptionResumes = async (jobDescriptionId, tenantId) => {
  const qdrant = getClient();
  await ensureHRCollection();

  await qdrant.delete(COLLECTION_NAME, {
    wait: true,
    filter: {
      must: [
        { key: 'job_description_id', match: { value: jobDescriptionId } },
        { key: 'tenant_id', match: { value: tenantId } },
      ],
    },
  });
};

module.exports = {
  ensureHRCollection,
  upsertResumeChunks,
  searchResumesForJD,
  getAllResumesForJD,
  deleteResumeChunks,
  deleteJobDescriptionResumes,
  COLLECTION_NAME,
};
