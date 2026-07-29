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

const embedSingle = async (text, taskType) => {
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
};

const embedDocumentChunks = async (texts) => {
  const embeddings = [];
  for (const text of texts) {
    embeddings.push(await embedSingle(text, 'RETRIEVAL_DOCUMENT'));
  }
  return embeddings;
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
