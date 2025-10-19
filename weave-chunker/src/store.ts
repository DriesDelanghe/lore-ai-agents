import Database from "better-sqlite3";
import { load as loadSqliteVec } from "sqlite-vec";

export type SearchHit = {
  id: string;
  path: string;
  chunk: string;
  distance: number;
  score: number;
  metadata?: string; // JSON
};

export class VectorStore {
  private db: Database.Database;
  private dim: number | null = null;
  private debug = false;

  constructor(private dbPath: string, opts?: { debug?: boolean }) {
    this.debug = !!opts?.debug;

    this.db = new Database(this.dbPath);
    this.db.pragma("journal_mode = WAL");
    loadSqliteVec(this.db);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS meta (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS chunks (
        rid        INTEGER PRIMARY KEY,
        id         TEXT UNIQUE NOT NULL,
        path       TEXT NOT NULL,
        chunk      TEXT NOT NULL,
        sha        TEXT NOT NULL,
        metadata   TEXT,                         -- NEW: JSON with universe/species/...
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_chunks_path ON chunks(path);
      CREATE INDEX IF NOT EXISTS idx_chunks_id   ON chunks(id);
    `);

    if (this.debug) {
      const existing = this.db
        .prepare(`SELECT name FROM sqlite_master WHERE type IN ('table','view') ORDER BY name`)
        .all()
        .map((r: any) => r.name);
      console.log("[store] opened DB:", this.dbPath, "objects:", existing);
    }
  }

  setDim(dim: number) {
    const row = this.db.prepare(`SELECT value FROM meta WHERE key='dim'`).get() as { value?: string } | undefined;
    if (!row) {
      this.db.prepare(`INSERT INTO meta(key,value) VALUES('dim',?)`).run(String(dim));
      this.db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS vec_chunks USING vec0(
          embedding float[${dim}]
        );
      `);
      if (this.debug) console.log("[store] setDim:", dim, "(created vec_chunks)");
    } else if (Number(row.value) !== dim) {
      throw new Error(`DB dim=${row.value} vs new dim=${dim}`);
    } else if (this.debug) {
      console.log("[store] setDim: already", dim);
    }
    this.dim = dim;
  }

  getDim(): number {
    if (this.dim) return this.dim;
    const row = this.db.prepare(`SELECT value FROM meta WHERE key='dim'`).get() as { value?: string } | undefined;
    if (!row) throw new Error("dim not set; bake first");
    this.dim = Number(row.value);
    if (this.debug) console.log("[store] getDim:", this.dim);
    return this.dim!;
  }

  upsertMany(rows: {
    id: string;
    path: string;
    chunk: string;
    embedding: Float32Array;
    sha: string;
    metadata?: string; // JSON
  }[]) {
    const ensureDim = this.getDim();

    const upsertChunkMeta = this.db.prepare(`
      INSERT INTO chunks(id, path, chunk, sha, metadata)
      VALUES (@id, @path, @chunk, @sha, @metadata)
      ON CONFLICT(id) DO UPDATE SET
        path=excluded.path,
        chunk=excluded.chunk,
        sha=excluded.sha,
        metadata=excluded.metadata
    `);

    const selectRid = this.db.prepare<{ id: string }, { rid: number }>(
      `SELECT rid FROM chunks WHERE id = @id`
    );

    const updateVec = this.db.prepare(`
      UPDATE vec_chunks
      SET embedding = vec_f32(@json)
      WHERE rowid = CAST(@rid AS INTEGER)
    `);
    const insertVec = this.db.prepare(`
      INSERT INTO vec_chunks(rowid, embedding)
      VALUES (CAST(@rid AS INTEGER), vec_f32(@json))
    `);

    const tx = this.db.transaction((batch: typeof rows) => {
      for (const r of batch) {
        if (r.embedding.length !== ensureDim) {
          throw new Error(`bad dim: got ${r.embedding.length}, expected ${ensureDim}`);
        }
        upsertChunkMeta.run({
          id: r.id, path: r.path, chunk: r.chunk, sha: r.sha, metadata: r.metadata ?? null
        });

        const ridRow = selectRid.get({ id: r.id });
        if (!ridRow) throw new Error(`failed to obtain rid for id=${r.id}`);
        const rid = Number(ridRow.rid);
        if (!Number.isInteger(rid)) throw new Error(`rid is not integer for id=${r.id}`);

        const json = JSON.stringify(Array.from(r.embedding));
        const u = updateVec.run({ rid, json });
        if (u.changes === 0) insertVec.run({ rid, json });

        if (this.debug) {
          console.log(`[store] upsert row id=${r.id} rid=${rid} path=${r.path} chunkLen=${r.chunk.length} updated=${u.changes>0}`);
        }
      }
    });

    tx(rows);

    if (this.debug) {
      const counts = this.db.prepare(`SELECT
        (SELECT COUNT(*) FROM chunks) AS chunks,
        (SELECT COUNT(*) FROM vec_chunks) AS vecs
      `).get() as any;
      console.log("[store] counts:", counts);
    }
  }

  searchKnn(query: Float32Array, k: number): SearchHit[] {
    this.getDim();
    const json = JSON.stringify(Array.from(query));
    const stmt = this.db.prepare(`
      SELECT c.id, c.path, c.chunk, c.metadata, distance
      FROM vec_chunks
      JOIN chunks c ON c.rid = vec_chunks.rowid
      WHERE vec_chunks.embedding MATCH vec_f32(@json) AND k = @k
    `);
    const rows = stmt.all({ json, k }) as Array<{
      id: string; path: string; chunk: string; metadata?: string; distance: number;
    }>;
    return rows.map(r => ({
      id: r.id,
      path: r.path,
      chunk: r.chunk,
      metadata: r.metadata,
      distance: r.distance,
      score: 1 / (1 + r.distance),
    }));
  }
}
