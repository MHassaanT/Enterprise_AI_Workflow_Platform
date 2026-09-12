const { GoogleGenAI } = require('@google/genai');
const axios = require('axios');

const EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001';
const EMBEDDING_DIMENSION = parseInt(process.env.EMBEDDING_DIMENSION || '768', 10);
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

let client = null;
let geminiFailed = false;

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

/**
 * OpenRouter Embedding Fallback (OpenAI text-embedding-3-small configured to 768d)
 * Ultra fast (~0.3s), reliable, and bypasses Google AI Studio depleted prepayment credits.
 */
const embedViaOpenRouter = async (texts, isQuery = false) => {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY is not configured for fallback embeddings.');
  }

  const isArray = Array.isArray(texts);
  const input = isArray ? texts : [texts];

  const BATCH_SIZE = 50;
  const allVectors = [];

  for (let i = 0; i < input.length; i += BATCH_SIZE) {
    const batch = input.slice(i, i + BATCH_SIZE);

    const response = await axios.post(
      'https://openrouter.ai/api/v1/embeddings',
      {
        model: 'text-embedding-3-small',
        input: batch,
        dimensions: EMBEDDING_DIMENSION, // Matches Qdrant collection (768)
      },
      {
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );

    const data = response.data?.data;
    if (!data || !Array.isArray(data)) {
      throw new Error('OpenRouter embedding API returned an invalid response.');
    }

    data.sort((a, b) => a.index - b.index);
    allVectors.push(...data.map((item) => item.embedding));
  }

  return isArray ? allVectors : allVectors[0];
};

const embedWithRetry = async (fn, maxRetries = 2) => {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      // Do NOT delay or retry if billing credits are depleted (it will never succeed)
      if (err.message?.includes('credits are depleted') || err.message?.includes('prepayment credits')) {
        throw err;
      }

      attempt++;
      const isRateLimit =
        err.message?.includes('429') ||
        err.message?.includes('RESOURCE_EXHAUSTED') ||
        err.status === 429;

      if (isRateLimit && attempt <= maxRetries) {
        const match =
          err.message?.match(/retryDelay.*?(\d+)/i) ||
          err.message?.match(/retry in ([\d.]+)/i);
        const waitSeconds = match ? Math.ceil(parseFloat(match[1])) + 2 : Math.min(6 * attempt, 20);
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

  // Fast-track to OpenRouter if Gemini previously failed with depleted credits
  if (geminiFailed && OPENROUTER_API_KEY) {
    return await embedViaOpenRouter(texts, false);
  }

  try {
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

      if (i + BATCH_SIZE < texts.length) {
        await sleep(200);
      }
    }

    return allEmbeddings;
  } catch (err) {
    if (OPENROUTER_API_KEY) {
      console.warn(
        `⚡ [Embeddings Fallback] Gemini embeddings unavailable. Instantly falling back to OpenRouter text-embedding-3-small (${EMBEDDING_DIMENSION}d)...`
      );
      geminiFailed = true;
      return await embedViaOpenRouter(texts, false);
    }
    throw err;
  }
};

const embedQuery = async (query) => {
  if (geminiFailed && OPENROUTER_API_KEY) {
    return await embedViaOpenRouter(query, true);
  }

  try {
    return await embedSingle(query, 'RETRIEVAL_QUERY');
  } catch (err) {
    if (OPENROUTER_API_KEY) {
      console.warn(
        `⚡ [Embeddings Fallback] Gemini query embedding failed. Falling back to OpenRouter...`
      );
      geminiFailed = true;
      return await embedViaOpenRouter(query, true);
    }
    throw err;
  }
};

module.exports = {
  embedDocumentChunks,
  embedQuery,
  EMBEDDING_MODEL,
  EMBEDDING_DIMENSION,
};
