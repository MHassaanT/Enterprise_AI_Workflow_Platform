const { GoogleGenAI } = require('@google/genai');

const EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001';
const EMBEDDING_DIMENSION = parseInt(process.env.EMBEDDING_DIMENSION || '768', 10);

let client = null;

const getClient = () => {
  if (!client) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY environment variable is required.');
    }
    client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return client;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const embedWithRetry = async (fn, maxRetries = 3) => {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      const isRateLimit =
        err.message?.includes('429') ||
        err.message?.includes('RESOURCE_EXHAUSTED') ||
        err.status === 429;

      if (isRateLimit && attempt <= maxRetries) {
        const match =
          err.message?.match(/retryDelay.*?(\d+)/i) ||
          err.message?.match(/retry in ([\d.]+)/i);
        const waitSeconds = match ? Math.ceil(parseFloat(match[1])) + 2 : Math.min(12 * attempt, 45);
        console.warn(
          `[Embeddings Quota Notice] 429 rate limit reached. Pausing for ${waitSeconds}s before automatic retry (attempt ${attempt}/${maxRetries})...`
        );
        await sleep(waitSeconds * 1000);
        continue;
      }
      throw err;
    }
  }
};

const embedSingle = async (text, taskType) => {
  return embedWithRetry(async () => {
    const ai = getClient();
    const response = await ai.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: text,
      config: {
        taskType,
        outputDimensionality: EMBEDDING_DIMENSION,
      },
    });

    const values = response.embeddings?.[0]?.values;
    if (!values) {
      throw new Error('Embedding API returned no vector.');
    }
    return values;
  });
};

const embedDocumentChunks = async (texts) => {
  if (!texts || texts.length === 0) return [];

  // Batch multiple chunks into a single embedContent API call (reduces API calls by 15x)
  const BATCH_SIZE = 15;
  const allEmbeddings = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);

    const batchEmbeddings = await embedWithRetry(async () => {
      const ai = getClient();
      const response = await ai.models.embedContent({
        model: EMBEDDING_MODEL,
        contents: batch,
        config: {
          taskType: 'RETRIEVAL_DOCUMENT',
          outputDimensionality: EMBEDDING_DIMENSION,
        },
      });

      const embeddingsList = response.embeddings || [];
      if (embeddingsList.length !== batch.length) {
        throw new Error(
          `Embedding API returned ${embeddingsList.length} vectors for ${batch.length} texts.`
        );
      }
      return embeddingsList.map((e) => e.values);
    });

    allEmbeddings.push(...batchEmbeddings);

    // Polite pacing delay between batches
    if (i + BATCH_SIZE < texts.length) {
      await sleep(250);
    }
  }

  return allEmbeddings;
};

const embedQuery = async (query) => {
  return embedSingle(query, 'RETRIEVAL_QUERY');
};

module.exports = {
  embedDocumentChunks,
  embedQuery,
  EMBEDDING_MODEL,
  EMBEDDING_DIMENSION,
};
