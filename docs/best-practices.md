# Weave.Chunker — Best Practices Guide

> **Goal:** Get the most accurate and relevant results from your lore database through optimal setup and querying techniques.

---

## 🔧 Optimal Setup

### 1. Metadata-First Indexing

Always specify metadata when baking to enable powerful filtering:

```bash
weave-chunker bake --dir ./kaelari-lore \
  --universe "Weave" \
  --species "Dromari" \
  --subspecies "Kaelari" \
  --debug
```

**Why?** Metadata enables filtering by universe/species and helps with cross-referencing when you have multiple lore domains.

### 2. Content Organization

**Structure your markdown files for optimal chunking:**

```markdown
# Main Topic (H1 - rarely used for chunking)

## Major Section (H2 - primary chunk boundary)
Content about this major concept...

### Subsection (H3 - creates nested chunks)
Specific details about a sub-concept...

### Another Subsection
More specific details...

## Another Major Section
Different major concept...
```

**Key principles:**
- Use **H2 for major concepts** that should be separate chunks
- Use **H3 for sub-concepts** that relate to the H2 parent
- Keep **lists and tables** in the same section as their explanation
- Use **bold** and **italic** to emphasize key terms (auto-extracted as entities)
- Use **quoted phrases** for special terms and concepts

---

## 🎯 Search Strategies

### 1. Start Broad, Then Filter

```bash
# 1. Broad search to understand what's available
weave-chunker search --q "governance" -k 10

# 2. Analyze the results and filter
weave-chunker search --q "governance" \
  --content-type narrative \
  --min-importance 0.7 \
  -k 5
```

### 2. Use Multiple Query Approaches

**Entity-focused queries** (for specific people, places, things):
```bash
weave-chunker search --q "Council of Artisans Talyren"
```

**Concept-focused queries** (for ideas, processes, relationships):
```bash
weave-chunker search --q "leadership selection merit-based rotation"
```

**Contextual queries** (for situational information):
```bash
weave-chunker search --q "what happens when leaders are chosen how"
```

### 3. Content Type Filtering

Different content types serve different purposes:

- **`narrative`**: Explanatory text, lore descriptions, background
- **`list`**: Structured information, catalogs, enumerations  
- **`quote`**: Direct quotes, sayings, important statements
- **`mixed`**: Sections with both narrative and structured content

```bash
# For detailed explanations
weave-chunker search --q "rituals" --content-type narrative

# For specific items or rules
weave-chunker search --q "professions" --content-type list

# For memorable sayings or key quotes
weave-chunker search --q "leadership wisdom" --content-type quote
```

### 4. Importance-Based Filtering

The importance score (0.0-1.0) is calculated based on:
- Density of proper nouns and entities
- Amount of emphasized text (bold/italic)
- Presence of quotes and structured content
- Content length and completeness

```bash
# High-importance content only (major lore points)
weave-chunker search --q "creation myths" --min-importance 0.8

# Medium importance (general information)
weave-chunker search --q "daily life" --min-importance 0.5

# All content (default behavior)
weave-chunker search --q "customs"
```

---

## 📊 Understanding Your Data

Use the analyze command to understand what's in your database:

```bash
weave-chunker analyze --db ./db/vec.db
```

This shows you:
- **Total chunks and size distribution**
- **Files breakdown** (which files contributed how many chunks)
- **Content type distribution** (narrative vs lists vs quotes)
- **Top entities and concepts** (what names and ideas appear most)
- **Top sections** (which parts of your lore are most detailed)
- **Importance score distribution** (how much high-value content you have)

Use this information to:
- **Identify gaps** in your lore coverage
- **Find over-detailed** or under-detailed areas
- **Understand entity relationships** and concept clustering
- **Optimize future queries** based on what content exists

---

## 🚀 Advanced Techniques

### 1. Multi-Stage Querying

For complex questions, break them down:

```bash
# Stage 1: Find the general area
weave-chunker search --q "rituals ceremonies" -k 8

# Stage 2: Get specific information from that area
weave-chunker search --q "coming of age first invention ritual" \
  --content-type narrative --min-importance 0.6 -k 3
```

### 2. Entity-Driven Exploration

When you find an interesting entity, explore it further:

```bash
# Found "Seven Harmonies" in results? Explore it
weave-chunker search --q "Seven Harmonies resonance pattern function"

# Found "Talyren"? Learn more
weave-chunker search --q "Talyren worship beliefs practices"
```

### 3. Cross-Domain Filtering

When you have multiple universes/species in one database:

```bash
weave-chunker search --q "governance" \
  --universe "Weave" \
  --species "Dromari" \
  --subspecies "Kaelari"
```

### 4. Debugging Poor Results

If you're getting irrelevant results:

```bash
# 1. Use debug mode to see what's happening
weave-chunker search --q "your query" --debug

# 2. Check if the content exists
weave-chunker analyze --db ./db/your-db.vec.db

# 3. Try different phrasings
weave-chunker search --q "alternative phrasing of your concept"

# 4. Look at top entities/concepts from analyze command
weave-chunker search --q "use actual entity names from your content"
```

---

## 🔍 Query Optimization Tips

### Do:
- **Use actual terms** from your lore (check with `analyze` command)
- **Combine multiple related concepts** in one query
- **Use content type filtering** to narrow down result types
- **Filter by importance** when you want only key information
- **Use debug mode** when results seem off

### Don't:
- **Use generic terms** that might not appear in your lore
- **Make queries too narrow** initially (start broad, then filter)
- **Ignore the metadata** in results (entities/concepts show related terms)
- **Query for information** that might not exist (check with `analyze` first)

### Example Query Progression:

```bash
# ❌ Too generic, might miss domain-specific terms
weave-chunker search --q "leaders"

# ✅ Better - uses likely domain terms
weave-chunker search --q "leadership governance authority"

# ✅ Even better - incorporates actual entities from your lore
weave-chunker search --q "Council of Artisans Seven Harmonies leadership"

# ✅ Best - targeted with filtering for specific information type
weave-chunker search --q "Council of Artisans selection process" \
  --content-type narrative --min-importance 0.6
```

---

## 🎨 Content Writing Tips

To get the best auto-extraction and search results:

### Entity Recognition
- **Capitalize proper nouns** consistently
- **Use bold or italics** for important terms: `**Council of Artisans**`
- **Quote special concepts**: `"Seven Harmonies"`

### Content Structure  
- **Lead with key information** in each section
- **Use descriptive headings** that contain searchable terms
- **Group related information** under the same heading
- **Include context** - don't assume readers know background

### Rich Metadata
- **Use lists** for enumerated information (auto-detected as structured content)
- **Include quotes** for memorable sayings or key principles  
- **Bold key terms** within narrative text
- **Cross-reference** related concepts within the same document

---

## 🛠 Troubleshooting

### "No relevant results found"
1. Run `analyze` to see what entities/concepts exist
2. Try broader queries with terms that actually appear in your content
3. Check if you have the right content type (narrative vs list vs quote)
4. Lower importance filtering or remove filters entirely

### "Results don't seem relevant"
1. Use `--debug` to see relevance scoring breakdown
2. Check if enhanced ranking is disabled (`--no-rerank`)
3. Verify your query terms appear in the content
4. Try entity-focused queries using names from the `analyze` output

### "Same results for different queries"
1. Your content might be too homogeneous - add more diverse sections
2. Try more specific, longer queries
3. Use content type and importance filtering to diversify results
4. Check chunk size - very large chunks might dominate results

---

This guide will help you get the most out of your lore database. Remember: the quality of your results depends heavily on the quality and structure of your source material!