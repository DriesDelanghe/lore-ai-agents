#!/usr/bin/env node
import { bake } from "./bake.js";
import { search } from "./search.js";
import {analyzeDatabase} from "./analyze.js";

type KV = Record<string, string | boolean>;

function parseArgs(argv: string[]) {
  const [, , cmd, ...rest] = argv;
  const kv: KV = {};
  let debug = false;

  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];

    if (a === "--debug") { debug = true; continue; }

    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq > -1) kv[a.slice(2, eq)] = a.slice(eq + 1);
      else {
        const key = a.slice(2);
        const next = rest[i + 1];
        if (next && !next.startsWith("-")) { kv[key] = next; i++; }
        else kv[key] = true;
      }
      continue;
    }

    if (a === "-q" || a === "-k") {
      const key = a === "-q" ? "q" : "k";
      const next = rest[i + 1];
      if (!next || next.startsWith("-")) throw new Error(`missing value for ${a}`);
      kv[key] = next; i++; continue;
    }
  }

  return { cmd, kv, debug };
}

async function main() {
  const { cmd, kv, debug } = parseArgs(process.argv);

  if (cmd === "bake") {
    await bake({
      dir: (kv.dir as string) || "./data",
      db: (kv.db as string) || "./db/vec.db",
      model: (kv.model as string) || "nomic-embed-text",
      maxChars: Number(kv.maxChars ?? 1200),
      overlap: Number(kv.overlap ?? 120),
      universe: kv.universe as string,
      species: kv.species as string,
      subspecies: kv.subspecies as string,
    }, debug);
    return;
  }

  if (cmd === "search") {
    const q = (kv.q as string) || "";
    if (!q) { console.error("missing --q"); process.exit(1); }
    
    // Parse filters from CLI args
    const filters: any = {};
    if (kv.universe) filters.universe = kv.universe;
    if (kv.species) filters.species = kv.species;
    if (kv.subspecies) filters.subspecies = kv.subspecies;
    if (kv.content_type) filters.content_type = kv.content_type;
    if (kv.min_importance) filters.min_importance = Number(kv.min_importance);
    
    await search({
      db: (kv.db as string) || "./db/vec.db",
      model: (kv.model as string) || "nomic-embed-text",
      q,
      k: Number(kv.k ?? 5),
      filters: Object.keys(filters).length > 0 ? filters : undefined,
      rerank: kv.no_rerank !== true, // disable with --no-rerank
      include_context: kv.no_context !== true, // disable with --no-context
    }, debug);
    return;
  }

  if (cmd === "analyze") {
    await analyzeDatabase((kv.db as string) || "./db/vec.db", debug);
    return;
  }

  if (cmd === "rebake") {
    // Force complete rebuild by deleting the database first
    const dbPath = (kv.db as string) || "./db/vec.db";
    const fs = await import("node:fs/promises");
    try {
      await fs.unlink(dbPath);
      console.log(`Deleted existing database: ${dbPath}`);
    } catch (e) {
      // Database doesn't exist, that's fine
    }
    
    // Now bake fresh
    await bake({
      dir: (kv.dir as string) || "./data",
      db: dbPath,
      model: (kv.model as string) || "nomic-embed-text",
      maxChars: Number(kv.maxChars ?? 1200),
      overlap: Number(kv.overlap ?? 120),
      universe: kv.universe as string,
      species: kv.species as string,
      subspecies: kv.subspecies as string,
    }, debug);
    return;
  }

  console.log(`weave-chunker

COMMANDS:
  bake     --dir ./data --db ./db/vec.db [OPTIONS]
           Index markdown files with enhanced chunking and metadata extraction
           
  rebake   --dir ./data --db ./db/vec.db [OPTIONS]
           Force complete re-index (deletes existing database first)
           
  search   --q "burial rites" --db ./db/vec.db [OPTIONS]
           Search with enhanced relevance scoring and filtering
           
  analyze  --db ./db/vec.db [OPTIONS]
           Analyze database contents and show statistics

BAKE OPTIONS:
  --dir DIR               Source directory for markdown files (default: ./data)
  --db FILE               SQLite database path (default: ./db/vec.db)  
  --model MODEL           Embedding model (default: nomic-embed-text)
  --universe NAME         Set universe in metadata
  --species NAME          Set species in metadata  
  --subspecies NAME       Set subspecies in metadata
  --debug                 Enable debug output

SEARCH OPTIONS:
  --q QUERY               Search query (required)
  --db FILE               SQLite database path (default: ./db/vec.db)
  --k NUMBER              Number of results (default: 5)
  --model MODEL           Embedding model (default: nomic-embed-text)
  
  FILTERS:
  --universe NAME         Filter by universe
  --species NAME          Filter by species
  --subspecies NAME       Filter by subspecies  
  --content-type TYPE     Filter by content type (narrative|list|quote|mixed)
  --min-importance NUM    Filter by minimum importance score (0.0-1.0)
  
  BEHAVIOR:
  --no-rerank             Disable enhanced relevance scoring
  --no-context            Disable section title context in results
  --debug                 Enable debug output

ENVIRONMENT:
  OPENAI_BASE_URL         OpenAI-compatible endpoint (default: http://localhost:11434/v1)
  OPENAI_API_KEY          API key (default: "ollama")

EXAMPLES:
  # Index with metadata
  weave-chunker bake --dir ./data --universe Weave --species Dromari --subspecies Kaelari
  
  # Force complete re-index (useful after code changes)
  weave-chunker rebake --dir ./data --universe Weave --species Dromari --subspecies Kaelari
  
  # Analyze what's in the database
  weave-chunker analyze --db ./db/vec.db
  
  # Basic search
  weave-chunker search --q "governance structure"
  
  # Filtered search
  weave-chunker search --q "rituals" --content-type quote --min-importance 0.7
`);
}

main().catch(e => { console.error(e); process.exit(1); });
