// src/bake.ts
import path from "node:path";
import fs from "node:fs/promises";
import { BakeOptionsSchema } from "./schemas.js";
import { walkMarkdown, sha1 } from "./util.js";
import { embedBatch } from "./embeddings.js";
import { VectorStore } from "./store.js";
import { chunkMarkdownByMeaning } from "./chunker.js";

function stats(arr: number[] | Float32Array) {
  if (!arr.length) return { min: 0, max: 0, mean: 0 };
  let min = Number.POSITIVE_INFINITY, max = Number.NEGATIVE_INFINITY, sum = 0;
  for (const x of arr as any) { if (x < min) min = x; if (x > max) max = x; sum += x; }
  return { min, max, mean: sum / arr.length };
}

export async function bake(rawOpts: unknown, debug = false) {
  const opts = BakeOptionsSchema.parse(rawOpts);
  const baseMeta = { universe: opts.universe, species: opts.species, subspecies: opts.subspecies };

  if (debug) console.log("[bake] options:", opts);
  const store = new VectorStore(opts.db, { debug });

  let total = 0;
  let dimSet = false;

  for await (const abs of walkMarkdown(opts.dir)) {
    const rel = path.relative(opts.dir, abs);
    const raw = await fs.readFile(abs, "utf8");

    const { chunks } = chunkMarkdownByMeaning(raw, rel, baseMeta, {
      maxTokens: 400,       // ~300–500 tokens  
      overlapRatio: 0.15,
      debug,
    });

    if (debug) console.log(`[bake] file=${rel} chunks=${chunks.length}`);
    if (chunks.length === 0) continue;

    const BATCH = 16;
    for (let i = 0; i < chunks.length; i += BATCH) {
      const slice = chunks.slice(i, i + BATCH);
      const texts = slice.map(s => s.text);
      const { vectors, dim } = await embedBatch(opts.model, texts);

      if (!dimSet) { store.setDim(dim); dimSet = true; }
      if (debug) {
        const st = stats(vectors[0] ?? []);
        console.log(`[bake] batch i=${i} dim=${dim} exampleVec[min,max,mean]=`, st);
      }

      const rows = slice.map((s, j) => {
        // If this section was actually split, parent_chunk_id is set; otherwise null
        const parent = s.meta.parent_chunk_id ?? null;
        // For stable ids, include either sub-index or full text hash
        const subKey = parent ? `:${j}` : "";
        const id = sha1(`${s.meta.source_file}:${s.meta.section_path}${subKey}`);

        return {
          id,
          path: rel,
          chunk: s.text,
          embedding: new Float32Array(vectors[j]),
          sha: sha1(`${rel}:${s.text}`),
          metadata: JSON.stringify(s.meta),
        };
      });

      store.upsertMany(rows);
      total += rows.length;
      if (!debug) process.stdout.write(`\rindexed ${total} chunks…`);
      else console.log(`[bake] upserted rows=${rows.length} total=${total}`);
    }
  }

  if (!debug) process.stdout.write(`\nDONE. stored ${total} chunks in ${opts.db}\n`);
  else console.log(`[bake] DONE total=${total} db=${opts.db}`);
}
