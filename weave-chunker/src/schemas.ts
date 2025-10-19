import { z } from "zod";

export const BakeOptionsSchema = z.object({
  dir: z.string().min(1),               // lore dir
  db: z.string().min(1),                // sqlite file
  model: z.string().min(1).default("nomic-embed-text"),
  maxChars: z.number().int().positive().default(1200), // kept for compat, not used now
  overlap: z.number().int().nonnegative().default(120), // kept for compat
  universe: z.string().optional(),
  species: z.string().optional(),
  subspecies: z.string().optional(),
});
export type BakeOptions = z.infer<typeof BakeOptionsSchema>;

export const ChunkRowSchema = z.object({
  id: z.string(),
  path: z.string(),
  chunk: z.string(),
  dim: z.number().int().positive(),
  embedding: z.instanceof(Buffer),      // Float32 bytes (if we were to store raw)
  sha: z.string(),
  created_at: z.string(),
  metadata: z.string().optional(),      // JSON string
});
export type ChunkRow = z.infer<typeof ChunkRowSchema>;

export const SearchOptionsSchema = z.object({
  db: z.string().min(1),
  model: z.string().min(1).default("nomic-embed-text"),
  q: z.string().min(1),
  k: z.number().int().positive().default(5),
  filters: z.object({
    universe: z.string().optional(),
    species: z.string().optional(),
    subspecies: z.string().optional(),
    content_type: z.enum(['narrative', 'list', 'quote', 'mixed']).optional(),
    min_importance: z.number().min(0).max(1).optional(),
  }).optional(),
  rerank: z.boolean().default(true),        // enable enhanced relevance scoring
  include_context: z.boolean().default(true), // include section titles in results
});
export type SearchOptions = z.infer<typeof SearchOptionsSchema>;
