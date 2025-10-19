// src/chunker.ts
//
// Meaning-first Markdown chunker with heading-aware splitting.
// - Supports H1/H2/H3. Logical chunks at H2/H3; if absent, make an "intro" chunk.
// - Keeps lists/tables/quotes intact within a section.
// - Splits oversized sections by paragraphs with light overlap (10–20%).
// - Emits metadata scaffold (universe/species/subspecies, source_file, section_path, etc.).

export type ChunkMeta = {
  universe?: string;
  species?: string;
  subspecies?: string;
  source_file: string;
  section_path: string;       // e.g., "rituals/major-rites/first-invention" or "intro"
  section_title?: string;     // actual heading text for context
  parent_section?: string;    // parent heading text if nested
  entities?: string[];
  aliases?: string[];
  concepts?: string[];        // automatically extracted key concepts
  content_type?: 'narrative' | 'list' | 'quote' | 'mixed';
  importance_score?: number;  // 0-1 based on content analysis
  parent_chunk_id?: string | null;
};

export type MeaningChunk = {
  id: string;                 // assign at bake-time
  text: string;
  meta: ChunkMeta;
};

type SplitOptions = {
  maxTokens?: number;    // target ~300–500 tokens (default 400)
  overlapRatio?: number; // 0.10–0.20 (default 0.15)
};

const DEFAULTS: Required<SplitOptions> = {
  maxTokens: 400,
  overlapRatio: 0.15,
};

// ~4 chars/token heuristic with minor bias for tables/lists
export function estimateTokens(s: string): number {
  const approx = Math.ceil(s.length / 4);
  const tableBonus = (s.match(/\|/g)?.length ?? 0) * 0.03;
  const listBonus = (s.match(/^(\s*[-*+]|\s*\d+\.)\s+/gm)?.length ?? 0) * 0.05;
  return Math.max(1, Math.floor(approx * (1 + tableBonus + listBonus)));
}

// Extract potential entities (proper nouns, quoted terms, emphasized words)
function extractEntities(text: string): string[] {
  const entities = new Set<string>();
  
  // Section headings and titles (remove markdown formatting)
  const headings = text.match(/^#+\s+(.+)$/gm) || [];
  headings.forEach(h => {
    const clean = h.replace(/^#+\s+/, '').replace(/[*_`~]/g, '').trim();
    if (clean.length > 2) entities.add(clean);
  });
  
  // Proper nouns (capitalized words that aren't at sentence start)
  const properNouns = text.match(/(?<!^|\. |\n)[A-Z][a-z]+(?:'[a-z]+)?/g) || [];
  properNouns.forEach(word => {
    if (word.length > 2 && !COMMON_WORDS.has(word.toLowerCase())) {
      entities.add(word);
    }
  });
  
  // Multi-word proper nouns and phrases
  const multiWord = text.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+/g) || [];
  multiWord.forEach(phrase => entities.add(phrase));
  
  // Capitalized phrases at line start (often titles or important terms)
  const titleCase = text.match(/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*$/gm) || [];
  titleCase.forEach(phrase => {
    if (phrase.length > 3 && phrase.length < 50) entities.add(phrase);
  });
  
  // Quoted terms (often concepts or special terms)
  const quoted = text.match(/"([^"]+)"/g) || [];
  quoted.forEach(q => {
    const clean = q.replace(/"/g, '');
    if (clean.length > 2) entities.add(clean);
  });
  
  // Bold/italic emphasized terms
  const emphasized = text.match(/\*\*([^*]+)\*\*|\*([^*]+)\*/g) || [];
  emphasized.forEach(e => {
    const clean = e.replace(/\*/g, '');
    if (clean.length > 2) entities.add(clean);
  });
  
  return Array.from(entities).slice(0, 25); // increased limit for better coverage
}

// Extract key concepts from text
function extractConcepts(text: string): string[] {
  const concepts = new Set<string>();
  
  // Section headings without markdown (these are often key concepts)
  const headings = text.match(/^#+\s+(.+)$/gm) || [];
  headings.forEach(h => {
    const clean = h.replace(/^#+\s+/, '').replace(/[*_`~🧠⚙️🏛✨📘📌🔮]/g, '').trim();
    if (clean.length > 3 && clean.length < 50) {
      concepts.add(clean);
    }
  });
  
  // Look for specific patterns that indicate concepts in lore
  const patterns = [
    /(?:the\s+)?([A-Z][a-z]+(?:\s+of\s+[A-Z][a-z]+)+)/g, // "Council of Artisans"
    /([A-Z][a-z]+\s+[A-Z][a-z]+s?)/g, // "Seven Harmonies", "Common Professions"
    /(?:known\s+as|called|termed)\s+([^.,\n]+)/g, // explicit definitions
    /^([A-Z][a-z]+(?:\s+[A-Z&][a-z]+)*):?$/gm, // Line-start title patterns
  ];
  
  patterns.forEach(pattern => {
    const matches = text.match(pattern) || [];
    matches.forEach(match => {
      const clean = match.replace(/^(?:the\s+|known\s+as\s+|called\s+|termed\s+)/i, '').replace(/:$/, '').trim();
      if (clean.length > 3 && clean.length < 50) {
        concepts.add(clean);
      }
    });
  });
  
  return Array.from(concepts).slice(0, 15);
}

// Analyze content type and importance
function analyzeContent(text: string): { type: 'narrative' | 'list' | 'quote' | 'mixed', importance: number } {
  const listLines = (text.match(/^\s*[-*+•]\s+/gm) || []).length;
  const numberedLines = (text.match(/^\s*\d+\.\s+/gm) || []).length;
  const quoteLines = (text.match(/^\s*>/gm) || []).length;
  const totalLines = text.split('\n').length;
  
  const listRatio = (listLines + numberedLines) / totalLines;
  const quoteRatio = quoteLines / totalLines;
  
  let type: 'narrative' | 'list' | 'quote' | 'mixed';
  if (quoteRatio > 0.5) type = 'quote';
  else if (listRatio > 0.4) type = 'list';
  else if (listRatio > 0.1 || quoteRatio > 0.1) type = 'mixed';
  else type = 'narrative';
  
  // Calculate importance based on various factors
  let importance = 0.5; // baseline
  
  // Boost for proper nouns and entities
  const properNouns = (text.match(/[A-Z][a-z]+/g) || []).length;
  importance += Math.min(0.3, properNouns * 0.02);
  
  // Boost for emphasized text
  const emphasized = (text.match(/\*\*[^*]+\*\*|\*[^*]+\*/g) || []).length;
  importance += Math.min(0.2, emphasized * 0.05);
  
  // Boost for dialogue or quotes (often important lore)
  if (quoteRatio > 0.2) importance += 0.15;
  
  // Boost for structured content (lists often contain key info)
  if (listRatio > 0.3) importance += 0.1;
  
  // Penalize very short chunks
  if (text.length < 100) importance -= 0.2;
  
  return { type, importance: Math.max(0.1, Math.min(1.0, importance)) };
}

// Common words to filter out from entity extraction
const COMMON_WORDS = new Set([
  'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
  'from', 'up', 'about', 'into', 'through', 'during', 'before', 'after', 'above',
  'below', 'between', 'among', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
  'may', 'might', 'must', 'can', 'shall', 'this', 'that', 'these', 'those'
]);

function normalizeBlock(s: string) {
  return s.replace(/\s+$/g, "").replace(/^\s+/g, "").replace(/\n{3,}/g, "\n\n");
}

// robust slug (emoji-safe, trims dashes)
function slugify(raw: string) {
  const s = raw
    .trim()
    // remove markdown markers
    .replace(/[*_`~]/g, "")
    // strip inline links/images markup
    .replace(/!?\[.*?\]\(.*?\)/g, (m) => {
      const inner = m.replace(/^!?\[|\]\(.*\)$/g, "");
      return inner;
    })
    // remove leading emoji/symbols
    .replace(/^[^\p{L}\p{N}]+/u, "")
    // keep letters/numbers/space/slash/colon/hyphen
    .replace(/[^\p{L}\p{N}\s/:-]/gu, "")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-/]+|[-/]+$/g, "");
  return s || "section";
}

// split one section by paragraphs with overlap
function splitSectionBySize(text: string, opts: Required<SplitOptions>) {
  const paras = text.split(/\n{2,}/);
  const out: string[] = [];
  let buf: string[] = [];
  let tokens = 0;

  const commit = () => {
    if (buf.length === 0) return;
    out.push(normalizeBlock(buf.join("\n\n")));
    buf = [];
    tokens = 0;
  };

  for (const p of paras) {
    const t = estimateTokens(p);
    if (tokens > 0 && tokens + t > opts.maxTokens) {
      const committed = normalizeBlock(buf.join("\n\n"));
      commit();
      if (committed.length > 0) {
        const overlapChars = Math.floor(committed.length * opts.overlapRatio);
        const overlapText = committed.slice(Math.max(0, committed.length - overlapChars));
        if (overlapText.trim()) {
          buf.push(overlapText);
          tokens = estimateTokens(overlapText);
        }
      }
    }
    buf.push(p);
    tokens += t;
  }
  commit();
  return out;
}

export function chunkMarkdownByMeaning(
  md: string,
  sourceFile: string,
  baseMeta: { universe?: string; species?: string; subspecies?: string },
  options: SplitOptions & { debug?: boolean } = {}
): { chunks: MeaningChunk[] } {
  const opts = { ...DEFAULTS, ...options };
  const debug = options.debug || false;
  const lines = md.replace(/\r\n/g, "\n").split("\n");

  type Frame = { level: 1 | 2 | 3; slug: string; title: string };
  let current: { h1?: Frame; h2?: Frame; h3?: Frame } = {};
  let sectionBuf: string[] = [];
  const sections: { path: string; text: string; title?: string; parent?: string }[] = [];

  const isFence = (s: string) => /^\s*```/.test(s);
  const isHeading = (s: string) => /^(#{1,6})\s+(.*)$/.exec(s);
  const isTableRow = (s: string) => /^\s*\|.*\|\s*$/.test(s);
  const isListItem = (s: string) => /^\s*(?:[-*+]|\d+\.)\s+/.test(s);
  const isQuote = (s: string) => /^\s*>/.test(s);

  let inFence = false;

  const currentPath = () => {
    // Logical chunk path creation - build hierarchical paths
    if (current.h2 && current.h3) return `${current.h2.slug}/${current.h3.slug}`;
    if (current.h3 && current.h1) return `${current.h1.slug}/${current.h3.slug}`; // H1 → H3 case
    if (current.h2) return current.h2.slug;
    if (current.h3) return current.h3.slug; // standalone H3
    if (current.h1) return current.h1.slug;
    return "intro";
  };

  const currentTitle = () => {
    if (current.h3) return current.h3.title;
    if (current.h2) return current.h2.title;
    if (current.h1) return current.h1.title;
    return undefined;
  };

  const currentParent = () => {
    if (current.h3 && current.h2) return current.h2.title;
    if (current.h2 && current.h1) return current.h1.title;
    return undefined;
  };

  const flush = () => {
    const text = normalizeBlock(sectionBuf.join("\n"));
    if (text.trim().length === 0) { sectionBuf = []; return; }
    const path = currentPath();
    const title = currentTitle();
    if (debug) console.log(`[chunker] Creating section: path="${path}", title="${title}", textLength=${text.length}`);
    sections.push({ 
      path, 
      text, 
      title,
      parent: currentParent()
    });
    sectionBuf = [];
  };

  for (const line of lines) {
    if (isFence(line)) { inFence = !inFence; continue; }
    if (inFence) continue;

    const mh = isHeading(line);
    if (mh) {
      // heading encountered → flush previous section
      flush();
      const level = Math.min(3, mh[1].length) as 1 | 2 | 3;
      const title = mh[2];
      const slug = slugify(title);
      if (level === 1) { 
        current = { h1: { level, slug, title } }; 
      }
      else if (level === 2) { 
        current.h2 = { level, slug, title }; 
        current.h3 = undefined; 
      }
      else if (level === 3) { 
        current.h3 = { level, slug, title }; 
      }
      continue;
    }

    // Keep structural lines; actual splitting by size happens later
    if (isTableRow(line) || isListItem(line) || isQuote(line) || true) {
      sectionBuf.push(line);
      continue;
    }
  }
  flush();

  // Turn sections into meaning chunks; split by size only when needed.
  const chunks: MeaningChunk[] = [];
  if (debug) console.log(`[chunker] Processing ${sections.length} sections for ${sourceFile}`);
  for (const sec of sections) {
    const est = estimateTokens(sec.text);
    // Combine title and text for analysis to get better entity/concept extraction
    const fullText = sec.title ? `${sec.title}\n\n${sec.text}` : sec.text;
    const entities = extractEntities(fullText);
    const concepts = extractConcepts(fullText);
    const { type: contentType, importance } = analyzeContent(sec.text);
    
    // Always include section title for better context and searchability
    const contextualText = sec.title && !sec.text.includes(sec.title) 
      ? `${sec.title}\n\n${sec.text}` 
      : sec.text;
    
    if (est <= opts.maxTokens) {
      chunks.push({
        id: "", // set in bake
        text: contextualText,
        meta: {
          ...baseMeta,
          source_file: sourceFile,
          section_path: sec.path,
          section_title: sec.title,
          parent_section: sec.parent,
          entities,
          concepts,
          content_type: contentType,
          importance_score: importance,
          aliases: [],
          parent_chunk_id: null,
        }
      });
    } else {
      const parts = splitSectionBySize(contextualText, opts);
      if (parts.length <= 1) {
        // nothing to split in practice
        chunks.push({
          id: "",
          text: contextualText,
          meta: {
            ...baseMeta,
            source_file: sourceFile,
            section_path: sec.path,
            section_title: sec.title,
            parent_section: sec.parent,
            entities,
            concepts,
            content_type: contentType,
            importance_score: importance,
            aliases: [],
            parent_chunk_id: null,
          }
        });
      } else {
        const parentId = `${sourceFile}:${sec.path}`;
        for (const p of parts) {
          // Re-analyze each part for more accurate metadata
          const partEntities = extractEntities(p);
          const partConcepts = extractConcepts(p);
          const { type: partType, importance: partImportance } = analyzeContent(p);
          
          chunks.push({
            id: "", // set in bake
            text: p,
            meta: {
              ...baseMeta,
              source_file: sourceFile,
              section_path: sec.path,
              section_title: sec.title,
              parent_section: sec.parent,
              entities: partEntities,
              concepts: partConcepts,
              content_type: partType,
              importance_score: partImportance,
              aliases: [],
              parent_chunk_id: parentId,
            }
          });
        }
      }
    }
  }

  return { chunks };
}
