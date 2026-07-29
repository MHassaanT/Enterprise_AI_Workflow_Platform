const { GoogleGenAI } = require('@google/genai');
const { embedQuery } = require('./embeddings');
const { searchByTenant } = require('./qdrant');

const GENERATION_MODEL = process.env.GEMINI_GENERATION_MODEL || 'gemini-2.0-flash';

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

const formatChunksAsContext = (chunks) => {
  return chunks
    .map((chunk, i) => {
      const citationId = i + 1;
      const location = [
        chunk.documentName,
        chunk.section ? `Section: ${chunk.section}` : null,
        chunk.page ? `Page ${chunk.page}` : null,
      ]
        .filter(Boolean)
        .join(' | ');

      return `[${citationId}] (Source: ${location})\n${chunk.text}`;
    })
    .join('\n\n---\n\n');
};

const buildPrompt = (question, contextBlock) => {
  return `You are a helpful assistant for an enterprise knowledge base.

Answer the user's question using ONLY the document excerpts below. If the answer is not contained in the excerpts, respond with: "I don't have enough information in the provided documents to answer that question."

Rules:
- Cite sources inline using the bracket markers from the excerpts (e.g. [1], [2]).
- Do not invent facts not present in the excerpts.
- Be concise and direct.

DOCUMENT EXCERPTS:
${contextBlock}

USER QUESTION: ${question}`;
};

/**
 * Retrieve relevant chunks and generate an answer with inline citations.
 */
const answerWithRAG = async (question, tenantId, { limit = 5 } = {}) => {
  const queryVector = await embedQuery(question);
  const chunks = await searchByTenant(queryVector, tenantId, { limit });

  if (chunks.length === 0) {
    return {
      answer: "I don't have enough information in the provided documents to answer that question.",
      citations: [],
      retrievedChunks: [],
    };
  }

  const contextBlock = formatChunksAsContext(chunks);
  const prompt = buildPrompt(question, contextBlock);

  const ai = getClient();
  const response = await ai.models.generateContent({
    model: GENERATION_MODEL,
    contents: prompt,
  });

  const answer = response.text || response.candidates?.[0]?.content?.parts?.[0]?.text || '';

  const citations = chunks.map((chunk, i) => ({
    id: i + 1,
    documentId: chunk.documentId,
    documentName: chunk.documentName,
    section: chunk.section,
    page: chunk.page,
    score: chunk.score,
    excerpt: chunk.text.slice(0, 200) + (chunk.text.length > 200 ? '...' : ''),
  }));

  return {
    answer: answer.trim(),
    citations,
    retrievedChunks: chunks,
  };
};

module.exports = {
  answerWithRAG,
  formatChunksAsContext,
  buildPrompt,
};
