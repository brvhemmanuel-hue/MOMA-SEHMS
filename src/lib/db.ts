import { Pool, type QueryResultRow } from 'pg';

declare global {
  // eslint-disable-next-line no-var
  var __momaPool: Pool | undefined;
}

function getPool(): Pool {
  if (!globalThis.__momaPool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    // Neon pooled connection string recommended. Keep the per-instance pool tiny for serverless.
    globalThis.__momaPool = new Pool({
      connectionString: url,
      max: 3,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 15_000, // tolerate Neon compute wake-up
    });
  }
  return globalThis.__momaPool;
}

export type Db = {
  query: <T extends QueryResultRow = any>(text: string, params?: unknown[]) => Promise<T[]>;
};

export async function query<T extends QueryResultRow = any>(text: string, params: unknown[] = []): Promise<T[]> {
  const res = await getPool().query<T>(text, params as any[]);
  return res.rows;
}

export async function one<T extends QueryResultRow = any>(text: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/** Runs fn inside a single transaction. Rolls back on any thrown error. */
export async function tx<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('begin');
    const db: Db = { query: async (text, params = []) => (await client.query(text, params as any[])).rows };
    const result = await fn(db);
    await client.query('commit');
    return result;
  } catch (err) {
    try { await client.query('rollback'); } catch { /* ignore */ }
    throw err;
  } finally {
    client.release();
  }
}

export const defaultDb: Db = { query };
