// Applies db/*.sql files in order. Safe to run repeatedly.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'db');
const url = process.env.DATABASE_URL;
if (!url) { console.error('Set DATABASE_URL first.'); process.exit(1); }

const client = new pg.Client({ connectionString: url });
await client.connect();
await client.query('create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())');
const done = new Set((await client.query('select name from schema_migrations')).rows.map((r) => r.name));
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
  if (done.has(f)) { console.log('skip   ', f); continue; }
  console.log('apply  ', f);
  await client.query('begin');
  try {
    await client.query(fs.readFileSync(path.join(dir, f), 'utf8'));
    await client.query('insert into schema_migrations (name) values ($1)', [f]);
    await client.query('commit');
  } catch (e) {
    await client.query('rollback');
    console.error('FAILED', f, e.message);
    process.exit(1);
  }
}
await client.end();
console.log('Migrations complete.');
