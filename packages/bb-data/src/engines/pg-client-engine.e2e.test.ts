// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * E2E test: PgClientEngine + withRLS against a real Supabase project.
 *
 * Prerequisites:
 *   1. A Supabase project with the following SQL executed:
 *
 *      CREATE TABLE todos (
 *        id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
 *        user_id uuid NOT NULL,
 *        content text NOT NULL
 *      );
 *      ALTER TABLE todos ENABLE ROW LEVEL SECURITY;
 *      CREATE POLICY "users_own_todos" ON todos
 *        FOR ALL USING (auth.uid() = user_id);
 *
 *      INSERT INTO todos (user_id, content) VALUES
 *        ('11111111-1111-1111-1111-111111111111', 'User 1 todo'),
 *        ('22222222-2222-2222-2222-222222222222', 'User 2 todo');
 *
 *   2. Environment variable SUPABASE_DB_URL set to the direct connection string
 *      (port 5432, using the `postgres` or `service_role` user).
 *
 * Run: SUPABASE_DB_URL=postgres://... node --test dist/engines/pg-client-engine.e2e.test.js
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { PgClientEngine } from './pg-client-engine.js';
import { RLSEnabledDatabase } from '../database.js';
import { sql } from '@aws-blocks/data-common';

const CONNECTION_STRING = process.env.SUPABASE_DB_URL;

const skip = !CONNECTION_STRING;

let engine: PgClientEngine;
let db: RLSEnabledDatabase;

before(() => {
  if (skip) return;
  engine = new PgClientEngine({
    connectionString: CONNECTION_STRING!,
    ssl: { rejectUnauthorized: false },
  });
  db = new RLSEnabledDatabase(engine);
});

after(async () => {
  if (engine) await engine.destroy();
});

test('E2E: direct query returns all rows (bypass mode)', { skip }, async () => {
  const rows = await db.query<{ content: string }>(sql`SELECT content FROM todos ORDER BY content`);
  // With service_role connection, RLS is bypassed — should see all rows
  assert.ok(rows.length >= 2, `Expected at least 2 rows, got ${rows.length}`);
});

test('E2E: withRLS({ userId: user-1 }) returns only user-1 rows', { skip }, async () => {
  const scoped = db.withRLS({ userId: '11111111-1111-1111-1111-111111111111' });
  const rows = await scoped.query<{ content: string; user_id: string }>(sql`SELECT * FROM todos`);
  assert.ok(rows.length > 0, 'Expected at least 1 row for user-1');
  for (const row of rows) {
    assert.strictEqual(row.user_id, '11111111-1111-1111-1111-111111111111');
  }
});

test('E2E: withRLS({ userId: user-2 }) returns only user-2 rows', { skip }, async () => {
  const scoped = db.withRLS({ userId: '22222222-2222-2222-2222-222222222222' });
  const rows = await scoped.query<{ content: string; user_id: string }>(sql`SELECT * FROM todos`);
  assert.ok(rows.length > 0, 'Expected at least 1 row for user-2');
  for (const row of rows) {
    assert.strictEqual(row.user_id, '22222222-2222-2222-2222-222222222222');
  }
});

test('E2E: withRLS({ userId: nonexistent }) returns empty array', { skip }, async () => {
  const scoped = db.withRLS({ userId: '99999999-9999-9999-9999-999999999999' });
  const rows = await scoped.query<{ content: string }>(sql`SELECT * FROM todos`);
  assert.deepStrictEqual(rows, []);
});
