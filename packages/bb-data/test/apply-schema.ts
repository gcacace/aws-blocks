/**
 * Applies the E2E test schema to the Supabase project.
 * Run: npx tsx packages/bb-data/test/apply-schema.ts
 *
 * Requires: SUPABASE_DB_URL env var (direct connection, port 5432).
 * All statements are idempotent — safe to run repeatedly.
 */
import pg from 'pg';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) {
  console.log('⏭ SUPABASE_DB_URL not set — skipping schema apply');
  process.exit(0);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sql = fs.readFileSync(path.join(__dirname, 'fixtures/supabase-e2e-schema.sql'), 'utf8');

const pool = new pg.Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });

try {
  await pool.query(sql);
  console.log('✓ E2E schema applied');
} catch (err: any) {
  console.error('✗ Failed to apply schema:', err.message);
  process.exit(1);
} finally {
  await pool.end();
}
