const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

const SUPPORTED_TYPES = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
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

const extractText = async (buffer, mimetype) => {
  const fileType = getFileType(mimetype);
  if (!fileType) {
    throw new Error('Unsupported file type. Only PDF and DOCX are allowed.');
  }

  if (fileType === 'pdf') {
    return { ...await extractFromPdf(buffer), fileType };
  }

  return { ...await extractFromDocx(buffer), fileType };
};

module.exports = { extractText, getFileType, SUPPORTED_TYPES };
