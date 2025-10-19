import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

export async function* walkMarkdown(root: string): AsyncGenerator<string> {
  for (const e of await fs.readdir(root, { withFileTypes: true })) {
    const p = path.join(root, e.name);
    if (e.isDirectory()) yield* walkMarkdown(p);
    else if (e.isFile() && p.toLowerCase().endsWith(".md")) yield p;
  }
}

export function sha1(str: string) {
  return crypto.createHash("sha1").update(str).digest("hex");
}

// convert number[] to Float32 Buffer
export function float32Buffer(arr: number[]) {
  const f = new Float32Array(arr);
  return Buffer.from(f.buffer);
}

// cosine similarity (debug/utility, not used by sqlite-vec path)
export function cosine(a: Float32Array, b: Float32Array) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9);
}
