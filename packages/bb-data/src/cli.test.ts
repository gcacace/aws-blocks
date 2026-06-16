// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { test } from 'node:test';
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// The compiled CLI sits next to this compiled test in dist/.
const CLI = join(dirname(fileURLToPath(import.meta.url)), 'cli.js');

function makeAppWithMigrations(): string {
  const dir = mkdtempSync(join(tmpdir(), 'bb-data-cli-'));
  mkdirSync(join(dir, 'migrations'));
  writeFileSync(join(dir, 'migrations', '001_add_priority.sql'), 'ALTER TABLE tasks ADD COLUMN priority int;');
  return dir;
}

/** Run the CLI, returning { status, stderr }. Never throws on non-zero exit. */
function runCli(args: string[], cwd: string, env: Record<string, string> = {}) {
  try {
    const stdout = execFileSync('node', [CLI, ...args], {
      cwd,
      env: { ...process.env, ...env },
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { status: 0, stderr: '', stdout };
  } catch (e: any) {
    return { status: e.status ?? 1, stderr: String(e.stderr ?? ''), stdout: String(e.stdout ?? '') };
  }
}

test('migrate refuses (exit 1) when an external DB is detected and --url is absent', () => {
  const dir = makeAppWithMigrations();
  try {
    const r = runCli(['migrate'], dir, {
      SUPABASE_DB_URL: 'postgresql://postgres.ref:pw@aws-0-us-east-1.pooler.supabase.com:6543/postgres',
    });
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /external database/i);
    assert.match(r.stderr, /--url/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('status refuses (exit 1) on an external app without --url', () => {
  const dir = makeAppWithMigrations();
  try {
    const r = runCli(['status'], dir, {
      MY_CONNECTION_STRING: 'postgresql://u:p@host:6543/db',
    });
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /external database/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('migrate exits 1 with a clear message when the migrations dir is missing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bb-data-cli-'));
  try {
    const r = runCli(['migrate'], dir, {});
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /Migrations directory not found/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('migrate --regenerate-types parses cleanly and stays inert without --url', () => {
  // The flag must not break arg parsing or consume the positional migrations dir;
  // without --url the external-DB guard still refuses (regen only runs post-apply).
  const dir = makeAppWithMigrations();
  try {
    const r = runCli(['migrate', '--regenerate-types'], dir, {
      SUPABASE_DB_URL: 'postgresql://postgres.ref:pw@aws-0-us-east-1.pooler.supabase.com:6543/postgres',
    });
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /external database/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('pull refuses (exit 1) in a non-TTY context and does NOT run headless off SUPABASE_DB_URL', () => {
  // Non-interactive mode was removed: `db pull` is interactive-only. Even with
  // SUPABASE_DB_URL set, a non-TTY invocation must fail fast (not hang on a
  // prompt) and must not generate any files from the env var.
  const dir = mkdtempSync(join(tmpdir(), 'bb-data-cli-'));
  try {
    const r = runCli(['pull'], dir, {
      SUPABASE_DB_URL: 'postgresql://postgres.ref:pw@aws-0-us-east-1.pooler.supabase.com:5432/postgres',
    });
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /interactive/i);
    assert.strictEqual(existsSync(join(dir, 'aws-blocks', 'database.meta.ts')), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
