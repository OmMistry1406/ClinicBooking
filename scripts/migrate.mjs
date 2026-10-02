// Applies supabase/migrations/*.sql in filename order against DATABASE_URL.
// Applied files are tracked in public.schema_migrations so reruns are safe.
import { config } from 'dotenv';
import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

config({ path: '.env.local' });
config();

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set (see .env.example).');
  process.exit(1);
}

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'migrations');
const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
try {
  await client.connect();
  await client.query(
    'create table if not exists public.schema_migrations (name text primary key, applied_at timestamptz not null default now())',
  );
  const { rows } = await client.query('select name from public.schema_migrations');
  const applied = new Set(rows.map((r) => r.name));

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`skip   ${file}`);
      continue;
    }
    const sql = await readFile(join(dir, file), 'utf8');
    try {
      await client.query('begin');
      await client.query(sql);
      await client.query('insert into public.schema_migrations(name) values ($1)', [file]);
      await client.query('commit');
      console.log(`apply  ${file}`);
    } catch (err) {
      await client.query('rollback');
      throw err;
    }
  }
  console.log('Migrations complete.');
} catch (err) {
  console.error('Migration failed:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
