# Weave.Chunker — Chunking Guide (Reference)

> **Mantra:** *Chunk by meaning, not length. Keep context whole, overlap lightly, tag everything.*

---

## What it does

* Parses Markdown into **meaningful chunks** (H1/H2/H3-aware).
* Preserves **lists**, **tables**, and **quotes** in-section.
* Splits oversized sections by **paragraphs** with **10–20% overlap**.
* Emits per-chunk **metadata** for precise filtering and provenance.

---

## CLI quickstart

```bash
# bake (index) all markdown files in ./data into sqlite-vec db with metadata
weave-chunker bake --dir ./data --db ./db/vec.db \
  --universe Weave --species Dromari --subspecies Kaelari --debug

# analyze what's in your database
weave-chunker analyze --db ./db/vec.db

# enhanced search with filtering
weave-chunker search --q "governance structure" --db ./db/vec.db \
  --content-type narrative --min-importance 0.6 --debug

# env for Ollama (OpenAI-compatible route)
export OPENAI_BASE_URL=http://localhost:11434/v1
export OPENAI_API_KEY=ollama
```

> If your OpenAI-compatible embeddings return zeros, Weave.Chunker auto-uses the **native Ollama embeddings** endpoint.

---

## Chunking rules (enforced)

1. **Headings:** H2/H3 define logical sections; H1 used when others missing; if no headings → `intro`.
2. **Integrity:** Keep **lists/tables** intact; attach **blockquotes** to their explainer paragraphs.
3. **Size target:** ~**300–500 tokens** (default 400).
4. **Overlap:** **10–20%** only when a section is split by size (default 15%).
5. **Enhanced Metadata** per chunk:

   * `universe`, `species`, `subspecies` (from CLI args)
   * `source_file` (relative path), `section_path` (e.g., `rituals/major-rites/sync-days`)
   * `section_title`, `parent_section` (heading context for better understanding)  
   * `entities: string[]` (auto-extracted proper nouns, names, emphasized terms)
   * `concepts: string[]` (auto-extracted key concepts and phrases)
   * `content_type` ('narrative' | 'list' | 'quote' | 'mixed')
   * `importance_score` (0-1, based on content analysis)
   * `aliases: string[]`, `parent_chunk_id` for micro-chunks (when a section is split)

---

## Enhanced Metadata Schema (JSON per chunk)

```json
{
  "universe": "Weave",
  "species": "Dromari", 
  "subspecies": "Kaelari",
  "source_file": "rituals-ceremonies-and-cultural-milestones.md",
  "section_path": "rituals/major-rites/first-invention",
  "section_title": "First Invention",
  "parent_section": "Major Rites",
  "entities": ["First Invention", "Talyren", "Kaelari"],
  "concepts": ["coming-of-age invention", "ritual significance"],
  "content_type": "narrative",
  "importance_score": 0.85,
  "aliases": [],
  "parent_chunk_id": null
}
```

> **Auto-extraction**: `entities` and `concepts` are now automatically extracted from content. `importance_score` is calculated based on content analysis. You can still enrich these manually if needed.

---

## DB layout (sqlite + sqlite-vec)

* `meta(key TEXT PRIMARY KEY, value TEXT)` → stores `dim`
* `chunks(rid INTEGER PRIMARY KEY, id TEXT UNIQUE, path TEXT, chunk TEXT, sha TEXT, metadata TEXT, created_at TEXT)`
* `vec_chunks` (virtual, via `vec0`) with `embedding float[DIM]` and rowid == `chunks.rid`

**Constraints:**

* `rid` must be an **integer**; `vec_chunks.rowid` is bound to that.
* No UPSERT on `vec_chunks`; logic does UPDATE→INSERT.

---

## Best practices

* **One doc, one domain:** keep each repo folder domain-scoped (e.g., `kaelari/`).
* **Avoid tiny chunks:** minimum a coherent paragraph; resist over-splitting.
* **Tables:** prefer compact, well-labeled columns; they embed well.
* **Headings:** write meaningful H2/H3; they drive `section_path` and retrieval.

---

## Debugging & Analysis

### Debug Mode
* `--debug` logs vector stats, relevance scoring breakdown, and metadata extraction
* Shows entity/concept extraction results during baking
* Displays enhanced relevance scoring during search

### Database Analysis
```bash
weave-chunker analyze --db ./db/vec.db
```
Shows comprehensive statistics:
- Chunk distribution by file and content type
- Top entities and concepts across your lore
- Importance score distribution
- Section breakdown and coverage

### Common Issues
* If distances are **all zero** in search → embeddings route issue (use native Ollama)
* If some files show **0 chunks**, they likely only contain fences/whitespace; add headings or narrative text
* If results seem irrelevant → use `analyze` to see actual entities/concepts in your data
* If importance scores are all low → add more **bold text**, proper nouns, and structured content

---

## Example: Result of a split

Input section:

```md
## Major Rites
The Kaelari honor three central rites.

### Sync Days
When all devices are harmonized with the city's ley grid.
```

Produced chunks:

* `section_path: rituals/major-rites` (overview)
* `section_path: rituals/major-rites/sync-days` (detail)
* Parent/child linkage via `parent_chunk_id` **only** when a section is split by size.

---

## Bake options

```bash
weave-chunker bake \
  --dir ./data \
  --db ./db/vec.db \
  --model nomic-embed-text \
  --universe "Weave" \
  --species "Dromari" \
  --subspecies "Kaelari" \
  --debug
```

**New capabilities:**
- Auto-extraction of entities (proper nouns, emphasized terms)
- Auto-extraction of concepts (key phrases, definitions)
- Content type analysis (narrative/list/quote/mixed)
- Importance scoring based on content analysis
- Section title preservation for better context

---

## Migration notes

* Added `metadata TEXT` to `chunks`. If upgrading, either:

  * `ALTER TABLE chunks ADD COLUMN metadata TEXT;` then re-bake, or
  * clean rebuild (recommended for PoC).

---

# Weave.Chunker — Retrieval Guide (Reference)

> **Goal:** fast, precise retrieval with clear provenance and predictable costs.

---

## CLI quickstart

```bash
# top-5 nearest chunks for a query with enhanced ranking
weave-chunker search --db ./db/vec.db --q "governance and structure" -k 5 --debug

# filtered search for high-importance narrative content
weave-chunker search --q "rituals" --content-type narrative --min-importance 0.7
```

**Enhanced Output:**

```json
{
  "query": "governance and structure",
  "results_requested": 5,
  "results_found": 5,
  "filters_applied": null,
  "hits": [
    {
      "id": "7155...91c0",
      "relevance_score": "0.847",
      "distance": "18.300",
      "path": "governance-and-social-structure.md",
      "section": "governance/social-structure",
      "title": "Kaelari Governance & Social Structure",
      "content_type": "narrative",
      "importance": "0.92",
      "entities": ["Council of Artisans", "Seven Harmonies", "Kaelari"],
      "concepts": ["merit-based governance", "rotating assembly"],
      "chunk": "Kaelari society is governed by the **Council of Artisans**...",
      "full_chunk" : "..."
    }
  ]
}
```

* `relevance_score`: Enhanced scoring combining vector similarity + content analysis
* `distance`: L2 distance from sqlite-vec  
* `importance`: Content importance score (0-1)
* `entities`/`concepts`: Auto-extracted semantic information

---

## How Enhanced Retrieval Works

1. Query is embedded via **Ollama embeddings** (`nomic-embed-text` by default).
2. sqlite-vec performs a **KNN** search with larger initial result set:
   ```sql
   WHERE vec_chunks.embedding MATCH vec_f32(@json) AND k = @larger_k
   ```
3. **Enhanced relevance scoring** combines:
   - Vector similarity (base score)
   - Query term matches in entities/concepts/titles (+0.1 to +0.3 boost)
   - Content importance score (+0.1 boost for high-importance content)
   - Content type bonuses (quotes +0.1, lists +0.05)
   - Length penalties for very short, low-importance chunks
4. **Filtering** by metadata (universe, species, content_type, min_importance)
5. **Re-ranking** and selection of top-K results

---

## Tuning knobs

* **k (top-K):** recall vs precision.

  * RAG often uses `k=5..8` → then re-rank to `3..5`.
* **Re-ranking:** optionally pass top-K to an LLM re-rank step (e.g., LlamaIndex `LLMReranker`).
* **Chunk size:** ~400 tokens default; lower for high-variance docs, higher for dense expository text.
* **Overlap:** set by splitter only when needed (default 15%).

---

## Integration options

### 1) Prefetch (mesh-controlled)

* Mesh calls `search` first.
* Sanitizes/dedupes/context windows the top chunks.
* Sends **read-only context** to the agent.
* Pros: strong cost/latency bounds, deterministic.

### 2) Tool access (bounded)

* Agent exposes `lore.search` MCP tool.
* Mesh enforces budget: max calls **N**, shrinking k (**8→4→2**), depth **≤2**.
* Pros: adaptive queries; better for multi-hop.

**Recommended hybrid:** Prefetch **+** allow **≤2** bounded tool calls when the agent self-assesses low confidence.

---

## MCP tool contract (suggested)

```json
# lore.search (input)
{ "q": "how do kaelari pick leaders?", "k": 6, "filter": { "species": "Dromari", "subspecies": "Kaelari" } }

# lore.search (output)
{
  "hits": [
    {
      "id": "7155...91c0",
      "path": "governance-and-social-structure.md",
      "text": "...",
      "metadata": { "section_path": "governance/social-structure", "source_file":"...", ... },
      "distance": 18.3
    }
  ],
  "trace": { "index_sha": "...", "model": "nomic-embed-text" }
}
```

> Filters can be applied in the mesh by inspecting `metadata` before returning to the agent.

---

## Safety & provenance

* **Provenance:** keep `id`, `path`, `section_path`, and the **raw chunk text** in logs.
* **Sanitization:** strip HTML/script; redact any out-of-scope content before passing to the LLM.
* **Citations:** require the agent to cite `id`/`section_path` for each claim.

---

## Troubleshooting

* **All scores ~1.0 / distances 0:** embedding route issue → switch to native Ollama embeddings (Weave.Chunker does this automatically now).
* **Same hits for different queries:** reduce chunk size; add H2/H3; ensure domain-specific terms appear in headings and text.
* **“Only integers allowed for primary key”:** ensure `vec_chunks.rowid` is bound with an **integer**; code handles this via `CAST(@rid AS INTEGER)`.

---

## Env & runtime

```bash
# embeddings (OpenAI-compatible route for Ollama)
export OPENAI_BASE_URL=http://localhost:11434/v1
export OPENAI_API_KEY=ollama

# native embeddings path is auto-selected on failure; to force OpenAI route:
export OLLAMA_NATIVE=0
```

---

## Example playbook (RAG answer)

1. `weave-chunker search -k 8 ...`
2. Mesh: dedupe by `section_path`, keep top **5** by distance, ensure total context ≤ **1.5k tokens**.
3. Optional: LLM re-rank to **3–4** passages.
4. Synthesize answer; attach citations (`id`, `section_path`).
5. If **low confidence**, allow **1** refinement call with smaller `k`.

---

## Versioning & cache keys

Cache keys should include:

* normalized query
* `k`
* embedding model name
* index signature: hash of `chunks.sha` set or `meta.dim`

---

## FAQ

**Q:** Can I store raw embeddings in SQLite?
**A:** Not needed; `sqlite-vec` stores its own vectors in the virtual table. Your `chunks` table stores text + metadata.

**Q:** Can I filter by metadata at query time?
**A:** `sqlite-vec` MATCH returns by vector only; apply metadata filtering in the mesh post-join (cheap) or maintain per-domain DBs.

**Q:** How large can my docs be?
**A:** Very large; they’ll be sectioned. Keep headings meaningful. Long tables still embed fine but consider adding descriptive paragraphs.

---

If you want, I can also generate a **cheat-sheet** with copy-pastable Docker/Compose + MCP tool JSON contracts tailored to your Kaelari historian.
