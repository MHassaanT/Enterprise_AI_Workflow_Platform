const MAX_CHUNK_CHARS = 1500;
const OVERLAP_CHARS = 100;

const HEADING_PATTERNS = [
  /^#{1,6}\s+.+$/m,                           // Markdown headings
  /^\d+(\.\d+)*\.?\s+[A-Z][^\n]{0,120}$/m,   // "1. Introduction", "2.1 Scope"
  /^[A-Z][A-Z0-9\s\-&:]{3,80}$/m,            // ALL CAPS section titles
];

const isHeading = (line) => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 120) return false;
  return HEADING_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(trimmed);
  });
};

const splitIntoSentences = (text) => {
  return text.match(/[^.!?]+[.!?]+|\S+/g) || [text];
};

const splitAtSentences = (text, maxChars) => {
  if (text.length <= maxChars) return [text];

  const sentences = splitIntoSentences(text);
  const chunks = [];
  let current = '';

  for (const sentence of sentences) {
    if (current.length + sentence.length > maxChars && current.length > 0) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current += sentence;
    }
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks;
};

const parseSections = (text) => {
  const lines = text.split('\n');
  const sections = [];
  let currentSection = { title: 'Introduction', lines: [] };

  for (const line of lines) {
    if (isHeading(line)) {
      if (currentSection.lines.length > 0) {
        sections.push(currentSection);
      }
      currentSection = { title: line.trim().replace(/^#+\s*/, ''), lines: [] };
    } else {
      currentSection.lines.push(line);
    }
  }

  if (currentSection.lines.length > 0) {
    sections.push(currentSection);
  }

  return sections;
};

const mergeParagraphs = (paragraphs, maxChars) => {
  const chunks = [];
  let current = '';

  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();
    if (!trimmed) continue;

    if (trimmed.length > maxChars) {
      if (current.trim()) {
        chunks.push(current.trim());
        current = '';
      }
      chunks.push(...splitAtSentences(trimmed, maxChars));
      continue;
    }

    if (current.length + trimmed.length + 2 > maxChars && current.length > 0) {
      chunks.push(current.trim());
      current = trimmed;
    } else {
      current = current ? `${current}\n\n${trimmed}` : trimmed;
    }
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks;
};

/**
 * Content-aware chunking: splits at headings, paragraphs, and sentence boundaries.
 * Each chunk carries document and section metadata for retrieval citations.
 */
const chunkDocument = ({ text, pages, documentId, documentName, tenantId }) => {
  const chunks = [];
  let chunkIndex = 0;

  const pageSections = pages && pages.length > 0
    ? pages.map((p) => ({
        page: p.page,
        sections: parseSections(p.text),
      }))
    : [{ page: 1, sections: parseSections(text) }];

  for (const { page, sections } of pageSections) {
    for (const section of sections) {
      const sectionText = section.lines.join('\n').trim();
      if (!sectionText) continue;

      const paragraphs = sectionText.split(/\n\s*\n/);
      const sectionChunks = mergeParagraphs(paragraphs, MAX_CHUNK_CHARS);

      for (const chunkText of sectionChunks) {
        chunks.push({
          text: chunkText,
          metadata: {
            document_id: documentId,
            document_name: documentName,
            tenant_id: tenantId,
            chunk_index: chunkIndex,
            section: section.title,
            page,
            char_count: chunkText.length,
          },
        });
        chunkIndex++;
      }
    }
  }

  // Fallback: if no chunks produced, create one from full text
  if (chunks.length === 0 && text.trim()) {
    const fallbackChunks = splitAtSentences(text.trim(), MAX_CHUNK_CHARS);
    fallbackChunks.forEach((chunkText) => {
      chunks.push({
        text: chunkText,
        metadata: {
          document_id: documentId,
          document_name: documentName,
          tenant_id: tenantId,
          chunk_index: chunkIndex,
          section: 'Document',
          page: 1,
          char_count: chunkText.length,
        },
      });
      chunkIndex++;
    });
  }

  return chunks;
};

module.exports = { chunkDocument, MAX_CHUNK_CHARS, OVERLAP_CHARS };
