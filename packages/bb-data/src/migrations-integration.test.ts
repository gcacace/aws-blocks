// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Integration tests for runMigrations() against PGlite.
 *
 * These tests exercise the full migration flow (create tracking table, apply in order,
 * skip applied, rollback on failure) using a real PostgreSQL engine.
 *
 * Unit tests for the underlying splitStatements() parser live in
 * @aws-blocks/data-common alongside the implementation.
 *
 * These tests live here (not in data-common) because they require PGliteEngine
 * which includes bb-data-specific error translation. Moving them would require
 * duplicating the engine adapter, breaking DRY.
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert';
import { PGliteEngine } from './engines/pglite-engine.js';
import { runMigrations } from '@aws-blocks/data-common';

let engine: PGliteEngine;
let testId = 0;

beforeEach(async () => {
  engine = new PGliteEngine(`memory://migrations-test-${++testId}`);
});

test('runMigrations creates tracking table and applies migrations', async () => {
  const migrations = {
    '001_create.sql': 'CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT)',
    '002_insert.sql': "INSERT INTO users VALUES ('u1', 'Alice')",
  };

  const applied = await runMigrations(engine, migrations);
  assert.deepStrictEqual(applied, ['001_create.sql', '002_insert.sql']);

  const rows = await engine.query<{ name: string }>('SELECT name FROM users');
  assert.deepStrictEqual(rows, [{ name: 'Alice' }]);

  // Tracking table has both entries
  const tracked = await engine.query<{ name: string }>('SELECT name FROM _migrations ORDER BY id');
  assert.deepStrictEqual(tracked.map(r => r.name), ['001_create.sql', '002_insert.sql']);

  await engine.destroy();
});

test('runMigrations skips already-applied migrations', async () => {
  const migrations = {
    '001_create.sql': 'CREATE TABLE t (id INT)',
  };

  await runMigrations(engine, migrations);
  const second = await runMigrations(engine, migrations);
  assert.deepStrictEqual(second, []);

  await engine.destroy();
});

test('runMigrations applies only new migrations on second run', async () => {
  const first = { '001_create.sql': 'CREATE TABLE t (id TEXT PRIMARY KEY)' };
  await runMigrations(engine, first);

  const second = {
    '001_create.sql': 'CREATE TABLE t (id TEXT PRIMARY KEY)',
    '002_insert.sql': "INSERT INTO t VALUES ('a')",
  };
  const applied = await runMigrations(engine, second);
  assert.deepStrictEqual(applied, ['002_insert.sql']);

  const rows = await engine.query<{ id: string }>('SELECT id FROM t');
  assert.deepStrictEqual(rows, [{ id: 'a' }]);

  await engine.destroy();
});

test('runMigrations rolls back failed migration', async () => {
  const migrations = {
    '001_create.sql': 'CREATE TABLE t (id TEXT PRIMARY KEY)',
    '002_bad.sql': 'INVALID SQL STATEMENT',
  };

  await assert.rejects(() => runMigrations(engine, migrations));

  // 001 was applied, 002 was not
  const tracked = await engine.query<{ name: string }>('SELECT name FROM _migrations');
  assert.deepStrictEqual(tracked.map(r => r.name), ['001_create.sql']);

  await engine.destroy();
});

test('runMigrations handles multi-statement files', async () => {
  const migrations = {
    '001_setup.sql': `
      CREATE TABLE accounts (id TEXT PRIMARY KEY, balance INT NOT NULL);
      INSERT INTO accounts VALUES ('a', 100);
      INSERT INTO accounts VALUES ('b', 200)
    `,
  };

  await runMigrations(engine, migrations);

  const rows = await engine.query<{ id: string; balance: number }>('SELECT * FROM accounts ORDER BY id');
  assert.deepStrictEqual(rows, [
    { id: 'a', balance: 100 },
    { id: 'b', balance: 200 },
  ]);

  await engine.destroy();
});


// ---------------------------------------------------------------------------
// Regression: the run-all / baseline path.
//
// A `pg_dump --schema-only` baseline (`000_baseline.sql`) opens with
//   SELECT pg_catalog.set_config('search_path', '', false);
// which empties the session search_path for the rest of the file. runMigrations
// then writes its own UNqualified `INSERT INTO _migrations` in the same
// transaction — which, before the fix, failed with `relation "_migrations" does
// not exist` and rolled the whole baseline back, so a fresh/empty database could
// never be built from a baseline. These tests exercise that path against a real
// Postgres engine (PGlite). They also pin the secondary hazard: the search_path
// reset must not leak into the next migration file.
// ---------------------------------------------------------------------------

// A faithful slice of real pg_dump output: SET noise, the session-level
// search_path reset, schema-qualified DDL, a dollar-quoted function body that
// contains a `CREATE TABLE` literal (which splitStatements must keep intact),
// RLS enable + policy, and a GRANT (to PUBLIC, which always exists in PGlite).
const PGDUMP_STYLE_BASELINE = `
\\restrict dPbJhhdUWDbOIUDELDNA5BNlkZZtw22YbgDApKQfjskhMNER8CpCrezca8v47XC
SET statement_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
CREATE TABLE public.runall_gadgets (id serial PRIMARY KEY, name text NOT NULL);
CREATE FUNCTION public.runall_note() RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  -- the literal below must NOT be split on its semicolons nor seen as real DDL
  RETURN 'CREATE TABLE nope (x int); DROP TABLE nope;';
END;
$$;
ALTER TABLE public.runall_gadgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY runall_all ON public.runall_gadgets USING (true);
GRANT SELECT ON public.runall_gadgets TO PUBLIC;
\\unrestrict dPbJhhdUWDbOIUDELDNA5BNlkZZtw22YbgDApKQfjskhMNER8CpCrezca8v47XC
`;

test('runMigrations applies a pg_dump baseline that resets search_path and records it (run-all)', async () => {
  const applied = await runMigrations(engine, { '000_baseline.sql': PGDUMP_STYLE_BASELINE });
  assert.deepStrictEqual(applied, ['000_baseline.sql']);

  // The fix: the bookkeeping row is recorded despite the baseline emptying search_path.
  const tracked = await engine.query<{ name: string }>('SELECT name FROM _migrations ORDER BY id');
  assert.deepStrictEqual(tracked.map(r => r.name), ['000_baseline.sql']);

  // The schema was actually built: table, RLS policy, and function all present.
  const tbl = await engine.query<{ c: number }>(
    `SELECT count(*)::int AS c FROM pg_tables WHERE schemaname='public' AND tablename='runall_gadgets'`,
  );
  assert.strictEqual(tbl[0].c, 1, 'baseline table created');
  const pol = await engine.query<{ c: number }>(
    `SELECT count(*)::int AS c FROM pg_policies WHERE tablename='runall_gadgets'`,
  );
  assert.strictEqual(pol[0].c, 1, 'baseline RLS policy created');
  const fn = await engine.query<{ c: number }>(
    `SELECT count(*)::int AS c FROM pg_proc WHERE proname='runall_note'`,
  );
  assert.strictEqual(fn[0].c, 1, 'baseline function created (dollar-quoted body intact)');

  await engine.destroy();
});

test('a baseline search_path reset does not leak into the next migration file', async () => {
  // The baseline empties search_path; the follow-on delta references the table
  // WITHOUT a schema qualifier. If the reset leaked, this ALTER would fail with
  // `relation "runall_gadgets" does not exist`.
  const applied = await runMigrations(engine, {
    '000_baseline.sql': PGDUMP_STYLE_BASELINE,
    '001_add_priority.sql': 'ALTER TABLE runall_gadgets ADD COLUMN priority integer NOT NULL DEFAULT 0;',
  });
  assert.deepStrictEqual(applied, ['000_baseline.sql', '001_add_priority.sql']);

  const cols = await engine.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns WHERE table_name='runall_gadgets' ORDER BY ordinal_position`,
  );
  assert.ok(cols.map(c => c.column_name).includes('priority'), 'unqualified delta applied after the baseline');

  // Idempotent: nothing re-applies on a second run.
  const again = await runMigrations(engine, {
    '000_baseline.sql': PGDUMP_STYLE_BASELINE,
    '001_add_priority.sql': 'ALTER TABLE runall_gadgets ADD COLUMN priority integer NOT NULL DEFAULT 0;',
  });
  assert.deepStrictEqual(again, []);

  await engine.destroy();
});
