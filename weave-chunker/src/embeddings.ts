import OpenAI from "openai";

const BASE = process.env.OPENAI_BASE_URL || "http://localhost:11434/v1";
const OLLAMA_BASE = BASE.replace(/\/v1\/?$/, ""); // -> http://localhost:11434

const client = new OpenAI({
  baseURL: BASE,
  apiKey: process.env.OPENAI_API_KEY || "ollama",
});

async function embedViaOllama(model: string, texts: string[]) {
  const out: Float32Array[] = [];
  for (const t of texts) {
    const r = await fetch(`${OLLAMA_BASE}/api/embeddings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model, prompt: t }),
    });
    if (!r.ok) throw new Error(`ollama embeddings http ${r.status}`);
    const j = await r.json();
    out.push(new Float32Array(j.embedding as number[]));
  }
  return out;
}

async function embedViaOpenAI(model: string, texts: string[]) {
  const res = await client.embeddings.create({ model, input: texts });
  return res.data.map(d => new Float32Array(d.embedding as unknown as number[]));
}

// native-first; set OLLAMA_NATIVE=0 to force OpenAI-compat
export async function embedBatch(model: string, texts: string[]): Promise<{ vectors: number[][], dim: number }> {
  const preferNative = process.env.OLLAMA_NATIVE !== "0";
  let vecs: Float32Array[];
  try {
    vecs = preferNative ? await embedViaOllama(model, texts) : await embedViaOpenAI(model, texts);
  } catch {
    vecs = preferNative ? await embedViaOpenAI(model, texts) : await embedViaOllama(model, texts);
  }
  const dim = vecs[0]?.length ?? 0;
  if (!dim) throw new Error("embedding returned dim=0");
  return { vectors: vecs.map(v => Array.from(v)), dim };
}

export async function embedOne(model: string, text: string): Promise<Float32Array> {
  const { vectors } = await embedBatch(model, [text]);
  return new Float32Array(vectors[0]);
}
