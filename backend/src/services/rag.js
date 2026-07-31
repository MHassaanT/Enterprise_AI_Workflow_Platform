const { GoogleGenAI } = require('@google/genai');
const { embedQuery } = require('./embeddings');
const { searchByTenant } = require('./qdrant');

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';

const generateWithOpenRouter = async (prompt) => {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'http://localhost:4000',
      'X-Title': 'Enterprise AI Workflow Platform',
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages: [
        {
          role: 'system',
          content: 'You are a concise customer support assistant. Answer the user\'s question using ONLY the provided document excerpts. Keep your response extremely brief (1-2 sentences max). Do NOT include extra details like category, target geography, or unrelated background unless explicitly asked. Do NOT include inline citation markers like [1], [2] in your answer.'
        },
        { role: 'user', content: prompt }
      ],
      temperature: 0.1,
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenRouter API error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
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
  return `DOCUMENT EXCERPTS:
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

  let answer = '';
  try {
    if (OPENROUTER_API_KEY) {
      answer = await generateWithOpenRouter(prompt);
    } else {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const res = await ai.models.generateContent({
        model: process.env.GEMINI_GENERATION_MODEL || 'gemini-2.0-flash',
        contents: prompt,
      });
      answer = res.text || '';
    }
  } catch (err) {
    console.warn('RAG generation error, producing concise snippet:', err.message);
    const topChunk = chunks[0]?.text || '';
    const cleanText = topChunk.replace(/\n+/g, ' ').trim();
    answer = cleanText.length > 250 ? cleanText.slice(0, 250) + '...' : cleanText;
  }

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
