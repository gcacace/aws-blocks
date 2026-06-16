// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import type { DatabaseEngine } from './engine.js';

/**
 * Regex matching a valid PostgreSQL dollar-quote opening tag.
 * Matches $$ (empty tag) or $identifier$ where the identifier starts with a
 * letter/underscore. Does NOT match positional params like $1, $2, $10.
 */
export const DOLLAR_QUOTE_TAG_RE = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/;

/**
 * Split a SQL file into individual statements.
 *
 * Handles:
 * - Standard semicolon-delimited statements
 * - Dollar-quoted blocks (DO $$ ... $$, $tag$ ... $tag$)
 * - Semicolons inside single-quoted string literals
 * - Line comments (-- ...) and block comments containing semicolons
 * - Positional bind parameters ($1, $2) are NOT treated as dollar-quote tags
 *
 * Does NOT handle:
 * - Nested dollar-quoting with different tags
 */
export const splitStatements = (sql: string): string[] => {
  const statements: string[] = [];
  let current = '';
  let i = 0;

  while (i < sql.length) {
    // Single-quoted string literal — skip to closing quote
    if (sql[i] === "'") {
      current += sql[i++];
      while (i < sql.length) {
        current += sql[i];
        if (sql[i] === "'" && sql[i + 1] !== "'") { i++; break; }
        if (sql[i] === "'" && sql[i + 1] === "'") { current += sql[++i]; } // escaped ''
        i++;
      }
      continue;
    }

    // Line comment — skip to end of line (do NOT split on ';' inside)
    if (sql[i] === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') i++;
      continue;
    }

    // Block comment — skip to closing '*/' (do NOT split on ';' inside)
    if (sql[i] === '/' && sql[i + 1] === '*') {
      i += 2;
      while (i < sql.length) {
        if (sql[i] === '*' && sql[i + 1] === '/') { i += 2; break; }
        i++;
      }
      continue;
    }

    // psql meta-command (e.g. pg_dump 17/18's `\restrict` / `\unrestrict`, added
    // for CVE-2025-1094). These are line-terminated psql directives, not SQL, and
    // would fail with `syntax error at or near "\"` if executed over the pg wire
    // protocol. They only appear between statements, so skip the whole line when
    // we're at the start of a statement (outside any quote/comment) — a real SQL
    // statement never begins with a backslash. A backslash *inside* a statement
    // or string literal has a non-empty `current` and is handled normally.
    if (sql[i] === '\\' && current.trim() === '') {
      while (i < sql.length && sql[i] !== '\n') i++;
      continue;
    }

    // Dollar-quoted block — a valid tag is $$ or $tag$ where tag starts with
    // a letter/underscore. Positional params like $1 are NOT dollar-quote openers.
    if (sql[i] === '$') {
      const tagMatch = sql.slice(i).match(DOLLAR_QUOTE_TAG_RE);
      if (tagMatch) {
        const tag = tagMatch[0];
        current += tag;
        i += tag.length;
        const closeIdx = sql.indexOf(tag, i);
        if (closeIdx !== -1) {
          current += sql.slice(i, closeIdx + tag.length);
          i = closeIdx + tag.length;
        }
        continue;
      }
    }

    // Statement terminator
    if (sql[i] === ';') {
      const trimmed = current.trim();
      if (trimmed.length > 0) statements.push(trimmed);
      current = '';
      i++;
      continue;
    }

    current += sql[i++];
  }

  const trimmed = current.trim();
  if (trimmed.length > 0) statements.push(trimmed);
  return statements;
};

/**
 * Run pending SQL migrations against a database engine.
 *
 * Tracks applied migrations in a `_migrations` table. Each migration file
 * is executed inside a transaction — all statements in the file succeed or
 * the entire file is rolled back. Already-applied migrations are skipped.
 *
 * @param engine - DatabaseEngine to run migrations against
 * @param migrations - Map of filename → SQL content, sorted by key
 * @returns Array of filenames that were applied
 */
export const runMigrations = async (
  engine: DatabaseEngine,
  migrations: Record<string, string>,
): Promise<string[]> => {
  // Ensure tracking table exists
  await engine.execute(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  // Remember the search_path that makes `_migrations` resolvable, and restore it
  // before each tracking write below. A migration may legitimately change the
  // session search_path — e.g. a pg_dump baseline runs
  // `set_config('search_path', '', false)` — which would otherwise make our
  // unqualified `INSERT INTO _migrations` fail and roll back the whole file.
  // (`SET ... TO DEFAULT`/`RESET` don't help: they fall back to the cluster
  // default, often just `pg_catalog`, not the schema holding `_migrations`.)
  // Postgres-only and best-effort: engines without `SHOW search_path` skip this
  // and keep the previous behavior.
  let trackingSearchPath: string | null = null;
  try {
    const rows = await engine.query<{ search_path: string }>('SHOW search_path');
    const value = rows[0]?.search_path?.trim();
    trackingSearchPath = value ? value : null;
  } catch {
    trackingSearchPath = null;
  }

  // Get already-applied migration names
  const applied = await engine.query<{ name: string }>(
    'SELECT name FROM _migrations ORDER BY id',
  );
  const appliedNames = new Set(applied.map(r => r.name));

  // Run pending migrations in order
  const files = Object.keys(migrations).sort();
  const results: string[] = [];

  for (const file of files) {
    if (appliedNames.has(file)) continue;

    const statements = splitStatements(migrations[file]);
    const handle = await engine.beginTransaction();

    try {
      for (const stmt of statements) {
        await engine.executeInTransaction(handle, stmt);
      }
      // Restore the remembered search_path so this tracking write — and the next
      // migration file — can resolve `_migrations`. Bound parameter, never
      // interpolated; persists past this transaction (`is_local=false`).
      if (trackingSearchPath) {
        await engine.executeInTransaction(
          handle,
          'SELECT set_config($1, $2, false)',
          ['search_path', trackingSearchPath],
        );
      }
      await engine.executeInTransaction(
        handle,
        'INSERT INTO _migrations (name) VALUES ($1)',
        [file],
      );
      await engine.commitTransaction(handle);
      results.push(file);
      console.log(`[migrations] Applied: ${file}`);
    } catch (e) {
      await engine.rollbackTransaction(handle).catch(() => {});
      console.error(`[migrations] Failed: ${file}`, e);
      throw e;
    }
  }

  return results;
};

/**
 * Load migration files from a directory.
 * Returns a map of filename → SQL content.
 */
export const loadMigrationsFromDir = async (dir: string): Promise<Record<string, string>> => {
  const { readdirSync, readFileSync } = await import('node:fs');
  const files = readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  const migrations: Record<string, string> = {};
  for (const file of files) {
    migrations[file] = readFileSync(`${dir}/${file}`, 'utf-8');
  }
  return migrations;
};
