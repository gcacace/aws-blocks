// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { test, describe } from 'node:test';
import assert from 'node:assert';
import { pgDumpMajorFromVersionString, serverMajorFromVersionNum, BASELINE_FILE, sanitizeBaselineForReplay } from './baseline.js';
import { extractCreatedTableNames, decideBaseline } from './external-migrations.js';

test('pgDumpMajorFromVersionString parses classic and modern formats', () => {
  assert.strictEqual(pgDumpMajorFromVersionString('pg_dump (PostgreSQL) 16.1'), 16);
  assert.strictEqual(pgDumpMajorFromVersionString('pg_dump (PostgreSQL) 17.2'), 17);
  assert.strictEqual(pgDumpMajorFromVersionString('pg_dump (PostgreSQL) 14.11 (Homebrew)'.replace(' (Homebrew)', '')), 14);
});

test('serverMajorFromVersionNum derives major from server_version_num', () => {
  assert.strictEqual(serverMajorFromVersionNum('150004'), 15);
  assert.strictEqual(serverMajorFromVersionNum(170002), 17);
  assert.strictEqual(serverMajorFromVersionNum('90623'), 9); // legacy
});

test('extractCreatedTableNames finds tables across qualified/quoted/IF NOT EXISTS forms', () => {
  const sql = `
    CREATE TABLE public.tasks (id text primary key);
    CREATE TABLE IF NOT EXISTS "categories" (id text);
    create table users (id text);
    ALTER TABLE tasks ADD COLUMN priority int;  -- not a create
  `;
  const names = extractCreatedTableNames(sql).sort();
  assert.deepStrictEqual(names, ['categories', 'tasks', 'users']);
});

test('decideBaseline: empty DB → run the baseline', () => {
  assert.strictEqual(decideBaseline(['tasks', 'categories'], []), 'run-all');
});

test('decideBaseline: all baseline tables present → mark applied, do not run', () => {
  assert.strictEqual(decideBaseline(['tasks', 'categories'], ['tasks', 'categories', 'other']), 'mark-baseline-applied');
});

test('decideBaseline: partial schema → ambiguous (caller errors)', () => {
  assert.strictEqual(decideBaseline(['tasks', 'categories'], ['tasks']), 'ambiguous');
});

test('decideBaseline: no baseline tables → run-all (nothing to check)', () => {
  assert.strictEqual(decideBaseline([], ['tasks']), 'run-all');
});

test('BASELINE_FILE sorts before delta migrations', () => {
  assert.ok(BASELINE_FILE < '001_add_priority.sql');
});

// ── sanitizeBaselineForReplay ──────────────────────────────────────────

describe('sanitizeBaselineForReplay', () => {
  test('strips CREATE SCHEMA public;', () => {
    const input = `SET statement_timeout = 0;\nCREATE SCHEMA public;\nCREATE TABLE tasks (id text);`;
    const result = sanitizeBaselineForReplay(input);
    assert.ok(!result.includes('CREATE SCHEMA public'));
    assert.ok(result.includes('CREATE TABLE tasks'));
  });

  test('does NOT strip CREATE SCHEMA public_data (exact match only)', () => {
    const input = `CREATE SCHEMA public_data;\nCREATE TABLE tasks (id text);`;
    const result = sanitizeBaselineForReplay(input);
    assert.ok(result.includes('CREATE SCHEMA public_data'));
  });

  test('strips COMMENT ON SCHEMA public', () => {
    const input = `COMMENT ON SCHEMA public IS 'standard public schema';\nCREATE TABLE t (id text);`;
    const result = sanitizeBaselineForReplay(input);
    assert.ok(!result.includes('COMMENT ON SCHEMA public'));
    assert.ok(result.includes('CREATE TABLE t'));
  });

  test('strips single-line ALTER DEFAULT PRIVILEGES', () => {
    const input = `ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin GRANT ALL ON TABLES TO postgres;\nCREATE TABLE t (id text);`;
    const result = sanitizeBaselineForReplay(input);
    assert.ok(!result.includes('ALTER DEFAULT PRIVILEGES'));
    assert.ok(!result.includes('GRANT ALL ON TABLES TO postgres'));
    assert.ok(result.includes('CREATE TABLE t'));
  });

  test('strips multi-line ALTER DEFAULT PRIVILEGES (continuation until ;)', () => {
    const input = [
      'SET search_path = public;',
      'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin',
      '    GRANT ALL ON TABLES TO postgres;',
      'CREATE TABLE tasks (id text PRIMARY KEY);',
    ].join('\n');
    const result = sanitizeBaselineForReplay(input);
    assert.ok(!result.includes('ALTER DEFAULT PRIVILEGES'));
    assert.ok(!result.includes('GRANT ALL ON TABLES TO postgres'));
    assert.ok(result.includes('SET search_path'));
    assert.ok(result.includes('CREATE TABLE tasks'));
  });

  test('strips multiple ALTER DEFAULT PRIVILEGES blocks', () => {
    const input = [
      'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin',
      '    GRANT ALL ON TABLES TO postgres;',
      'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin',
      '    GRANT ALL ON SEQUENCES TO postgres;',
      'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin',
      '    GRANT ALL ON FUNCTIONS TO postgres;',
      'GRANT SELECT ON tasks TO authenticated;',
    ].join('\n');
    const result = sanitizeBaselineForReplay(input);
    assert.ok(!result.includes('ALTER DEFAULT PRIVILEGES'));
    // Preserves load-bearing GRANTs (not part of ALTER DEFAULT PRIVILEGES)
    assert.ok(result.includes('GRANT SELECT ON tasks TO authenticated'));
  });

  test('rewrites CREATE FUNCTION to CREATE OR REPLACE FUNCTION', () => {
    const input = `CREATE FUNCTION set_updated_at() RETURNS trigger AS $$ BEGIN END; $$ LANGUAGE plpgsql;`;
    const result = sanitizeBaselineForReplay(input);
    assert.ok(result.includes('CREATE OR REPLACE FUNCTION set_updated_at()'));
    assert.ok(!result.match(/(?<!OR REPLACE )FUNCTION set_updated_at/));
  });

  test('does not double-replace existing CREATE OR REPLACE FUNCTION', () => {
    const input = `CREATE OR REPLACE FUNCTION my_fn() RETURNS void AS $$ BEGIN END; $$ LANGUAGE plpgsql;`;
    const result = sanitizeBaselineForReplay(input);
    assert.ok(!result.includes('OR REPLACE OR REPLACE'));
    assert.ok(result.includes('CREATE OR REPLACE FUNCTION my_fn()'));
  });

  test('preserves GRANT statements for the authenticated role', () => {
    const input = [
      'GRANT SELECT, INSERT, UPDATE, DELETE ON tasks TO authenticated;',
      'GRANT USAGE, SELECT ON SEQUENCE tasks_id_seq TO authenticated;',
    ].join('\n');
    const result = sanitizeBaselineForReplay(input);
    assert.ok(result.includes('GRANT SELECT, INSERT, UPDATE, DELETE ON tasks TO authenticated'));
    assert.ok(result.includes('GRANT USAGE, SELECT ON SEQUENCE tasks_id_seq TO authenticated'));
  });

  test('handles empty input', () => {
    assert.strictEqual(sanitizeBaselineForReplay(''), '');
  });

  test('full realistic pg_dump snippet', () => {
    const input = [
      '--',
      '-- PostgreSQL database dump',
      '--',
      'SET statement_timeout = 0;',
      'CREATE SCHEMA public;',
      "COMMENT ON SCHEMA public IS 'standard public schema';",
      'SET search_path = public;',
      'CREATE FUNCTION set_updated_at() RETURNS trigger',
      "    LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;",
      'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin',
      '    GRANT ALL ON TABLES TO postgres;',
      'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin',
      '    GRANT ALL ON SEQUENCES TO postgres;',
      'CREATE TABLE todos (',
      '    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,',
      "    user_id text DEFAULT (auth.jwt() ->> 'sub'),",
      '    title text NOT NULL',
      ');',
      'ALTER TABLE todos ENABLE ROW LEVEL SECURITY;',
      "CREATE POLICY todos_select ON todos FOR SELECT USING (user_id = current_setting('request.jwt.claims', true)::jsonb ->> 'sub');",
      'GRANT SELECT, INSERT, UPDATE, DELETE ON todos TO authenticated;',
    ].join('\n');

    const result = sanitizeBaselineForReplay(input);

    // Stripped
    assert.ok(!result.includes('CREATE SCHEMA public;'));
    assert.ok(!result.includes('COMMENT ON SCHEMA public'));
    assert.ok(!result.includes('ALTER DEFAULT PRIVILEGES'));

    // Preserved
    assert.ok(result.includes('SET statement_timeout'));
    assert.ok(result.includes('SET search_path'));
    assert.ok(result.includes('CREATE OR REPLACE FUNCTION set_updated_at()'));
    assert.ok(result.includes('CREATE TABLE todos'));
    assert.ok(result.includes('ENABLE ROW LEVEL SECURITY'));
    assert.ok(result.includes('CREATE POLICY'));
    assert.ok(result.includes('GRANT SELECT, INSERT, UPDATE, DELETE ON todos TO authenticated'));
  });
});
