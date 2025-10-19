import { SearchOptionsSchema } from "./schemas.js";
import { embedOne } from "./embeddings.js";
import { VectorStore, SearchHit } from "./store.js";

function stats(arr: Float32Array) {
  if (!arr.length) return { min: 0, max: 0, mean: 0 };
  let min = Number.POSITIVE_INFINITY, max = Number.NEGATIVE_INFINITY, sum = 0;
  for (const x of arr) { if (x < min) min = x; if (x > max) max = x; sum += x; }
  return { min, max, mean: sum / arr.length };
}

// Enhanced relevance scoring that combines vector similarity with content analysis
function calculateRelevanceScore(hit: SearchHit, query: string, debug = false): number {
  let score = hit.score; // base vector similarity score (1/(1+distance))
  
  try {
    const metadata = hit.metadata ? JSON.parse(hit.metadata) : {};
    
    // Boost for query terms appearing in entities or concepts
    const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
    const entities = (metadata.entities || []).map((e: string) => e.toLowerCase());
    const concepts = (metadata.concepts || []).map((c: string) => c.toLowerCase());
    
    let termMatchBoost = 0;
    
    // Check each query term against various metadata fields
    for (const term of queryTerms) {
      // Exact matches in entities/concepts get highest boost
      if (entities.some((e: string) => e === term)) termMatchBoost += 0.4;
      else if (entities.some((e: string) => e.includes(term))) termMatchBoost += 0.2;
      
      if (concepts.some((c: string) => c === term)) termMatchBoost += 0.35;
      else if (concepts.some((c: string) => c.includes(term))) termMatchBoost += 0.15;
      
      // Section title and path matches
      if (metadata.section_title?.toLowerCase() === term) termMatchBoost += 0.5;
      else if (metadata.section_title?.toLowerCase().includes(term)) termMatchBoost += 0.3;
      
      if (metadata.section_path?.toLowerCase().includes(term)) termMatchBoost += 0.25;
      
      // Source file name matches
      if (metadata.source_file?.toLowerCase().includes(term)) termMatchBoost += 0.2;
    }
    
    // Multi-term phrase matching
    const queryPhrase = query.toLowerCase();
    if (metadata.section_title?.toLowerCase().includes(queryPhrase)) termMatchBoost += 0.4;
    if (entities.some((e: string) => e.includes(queryPhrase))) termMatchBoost += 0.3;
    if (concepts.some((c: string) => c.includes(queryPhrase))) termMatchBoost += 0.25;
    
    // Boost based on content importance
    const importanceBoost = (metadata.importance_score || 0.5) * 0.1;
    
    // Boost for certain content types that tend to be more informative
    let contentTypeBoost = 0;
    switch (metadata.content_type) {
      case 'quote': contentTypeBoost = 0.1; break; // Quotes often contain key lore
      case 'list': contentTypeBoost = 0.05; break; // Lists are structured info
      case 'mixed': contentTypeBoost = 0.03; break;
      default: contentTypeBoost = 0; break;
    }
    
    // Text content matching boost
    let textMatchBoost = 0;
    const lowerText = hit.chunk.toLowerCase();
    for (const term of queryTerms) {
      if (lowerText.includes(term)) textMatchBoost += 0.1;
    }
    if (lowerText.includes(queryPhrase)) textMatchBoost += 0.15;
    
    // Penalize very short chunks unless they're high importance
    let lengthPenalty = 0;
    if (hit.chunk.length < 100 && (metadata.importance_score || 0.5) < 0.7) {
      lengthPenalty = -0.1;
    }
    
    score = score + termMatchBoost + importanceBoost + contentTypeBoost + textMatchBoost + lengthPenalty;
    
  } catch (e) {
    // If metadata parsing fails, just use base score
    if (debug) console.warn("[search] metadata parse error:", e);
  }
  
  return Math.max(0.001, Math.min(2.0, score)); // clamp to reasonable range
}

// Filter results based on metadata criteria
function applyFilters(hits: SearchHit[], filters: any): SearchHit[] {
  if (!filters || Object.keys(filters).length === 0) return hits;
  
  return hits.filter(hit => {
    try {
      const metadata = hit.metadata ? JSON.parse(hit.metadata) : {};
      
      // Apply universe/species/subspecies filters
      if (filters.universe && metadata.universe !== filters.universe) return false;
      if (filters.species && metadata.species !== filters.species) return false;
      if (filters.subspecies && metadata.subspecies !== filters.subspecies) return false;
      
      // Apply content type filter
      if (filters.content_type && metadata.content_type !== filters.content_type) return false;
      
      // Apply minimum importance filter
      if (filters.min_importance && (metadata.importance_score || 0) < filters.min_importance) return false;
      
      return true;
    } catch {
      return true; // include if we can't parse metadata
    }
  });
}

export async function search(rawOpts: unknown, debug = false) {
  const opts = SearchOptionsSchema.parse(rawOpts);

  const qvec = await embedOne(opts.model, opts.q);
  if (debug) console.log("[search] q=", JSON.stringify(opts.q), "dim=", qvec.length, "stats=", stats(qvec));

  const store = new VectorStore(opts.db, { debug });
  store.getDim(); // ensure init
  
  // Get more results initially for better filtering/ranking
  const searchK = Math.max(opts.k * 2, 20);
  let hits = store.searchKnn(qvec, searchK);

  // Apply filters if any
  const filters = (opts as any).filters;
  if (filters) {
    hits = applyFilters(hits, filters);
    if (debug) console.log(`[search] after filtering: ${hits.length} hits`);
  }

  // Enhanced relevance scoring
  hits = hits.map(hit => ({
    ...hit,
    relevance_score: calculateRelevanceScore(hit, opts.q, debug)
  }));

  // Sort by enhanced relevance score
  hits.sort((a, b) => (b as any).relevance_score - (a as any).relevance_score);
  
  // Take top K results
  hits = hits.slice(0, opts.k);

  if (debug) {
    console.log("[search] final hits:", hits.map(h => ({ 
      id: h.id, 
      dist: h.distance.toFixed(6), 
      score: h.score.toFixed(6),
      relevance: (h as any).relevance_score?.toFixed(6),
      title: (() => {
        try {
          return JSON.parse(h.metadata || '{}').section_title || 'no title';
        } catch {
          return 'parse error';
        }
      })()
    })));
  }
  
  // Format output for better readability
  const formattedHits = hits.map(hit => {
    const metadata = hit.metadata ? (() => {
      try { return JSON.parse(hit.metadata); } catch { return {}; }
    })() : {};
    
    return {
      id: hit.id,
      relevance_score: (hit as any).relevance_score?.toFixed(3),
      distance: hit.distance.toFixed(3),
      path: hit.path,
      section: metadata.section_path || 'unknown',
      title: metadata.section_title || null,
      content_type: metadata.content_type || null,
      importance: metadata.importance_score?.toFixed(2) || null,
      entities: metadata.entities || [],
      concepts: metadata.concepts || [],
      chunk: hit.chunk.length > 200 ? hit.chunk.substring(0, 200) + "..." : hit.chunk,
      full_chunk: opts.include_context !== false ? hit.chunk : undefined,
      metadata: debug ? hit.metadata : undefined
    };
  });
  
  console.log(JSON.stringify({ 
    query: opts.q, 
    results_requested: opts.k, 
    results_found: hits.length,
    filters_applied: opts.filters || null,
    hits: formattedHits
  }, null, 2));
}
