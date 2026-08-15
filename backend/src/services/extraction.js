const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const { GoogleGenAI } = require('@google/genai');

const SUPPORTED_TYPES = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'text/markdown': 'md',
  'text/plain': 'md',
  'image/png': 'image',
  'image/jpeg': 'image',
  'image/webp': 'image'
};

const getFileType = (mimetype) => SUPPORTED_TYPES[mimetype] || null;

const extractFromPdf = async (buffer) => {
  const data = await pdfParse(buffer);
  const pages = [];

  // pdf-parse joins pages with form-feed; split to preserve page numbers
  const pageTexts = data.text.split('\f');
  pageTexts.forEach((pageText, index) => {
    const trimmed = pageText.trim();
    if (trimmed) {
      pages.push({ page: index + 1, text: trimmed });
    }
  });

  if (pages.length === 0 && data.text.trim()) {
    pages.push({ page: 1, text: data.text.trim() });
  }

  return {
    text: data.text.trim(),
    pages,
    pageCount: data.numpages || pages.length,
  };
};

const extractFromDocx = async (buffer) => {
  // Markdown preserves heading structure for content-aware chunking
  const result = await mammoth.convertToMarkdown({ buffer });
  const text = result.value.trim();

  return {
    text,
    pages: [{ page: 1, text }],
    pageCount: 1,
  };
};

const extractFromMd = async (buffer) => {
  const text = buffer.toString('utf8').trim();
  return {
    text,
    pages: [{ page: 1, text }],
    pageCount: 1,
  };
};

const extractFromImage = async (buffer, mimetype) => {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY environment variable is required for image extraction.');
  }
  
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const prompt = `Please extract all visible text (OCR) from this image. Then, provide a detailed visual description of what the image depicts so that it can be searched for later in a knowledge base. Format the output in Markdown.`;

  const response = await ai.models.generateContent({
    model: process.env.GEMINI_VISION_MODEL || process.env.GEMINI_GENERATION_MODEL || 'gemini-2.5-flash',
    contents: [
      {
        parts: [
          { text: prompt },
          {
            inlineData: {
              data: buffer.toString("base64"),
              mimeType: mimetype,
            }
          }
        ]
      }
    ]
  });

  const text = response.text.trim();
  
  return {
    text,
    pages: [{ page: 1, text }],
    pageCount: 1,
  };
};

const extractText = async (buffer, mimetype) => {
  const fileType = getFileType(mimetype);
  if (!fileType) {
    throw new Error('Unsupported file type.');
  }

  if (fileType === 'pdf') {
    return { ...await extractFromPdf(buffer), fileType };
  }
  if (fileType === 'docx') {
    return { ...await extractFromDocx(buffer), fileType };
  }
  if (fileType === 'md') {
    return { ...await extractFromMd(buffer), fileType };
  }
  if (fileType === 'image') {
    return { ...await extractFromImage(buffer, mimetype), fileType };
  }
};

module.exports = { extractText, getFileType, SUPPORTED_TYPES };
