// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { test, afterEach } from 'node:test';
import assert from 'node:assert';
import { PGliteEngine } from './engines/pglite-engine.js';
import { generateTypes } from './type-generator.js';
import { rmSync } from 'node:fs';

const TEST_DIR = '.bb-data-typegen-' + process.pid;
let engine: PGliteEngine;

afterEach(async () => {
  if (engine) await engine.destroy().catch(() => {});
  rmSync(TEST_DIR, { recursive: true, force: true });
});

test('generateTypes produces interfaces for tables', async () => {
  engine = new PGliteEngine(TEST_DIR);
  await engine.execute('CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT)');
  await engine.execute('CREATE TABLE posts (id TEXT PRIMARY KEY, title TEXT NOT NULL)');

  const output = await generateTypes(engine);

  assert.ok(output.includes('export interface UsersTable'));
  assert.ok(output.includes('id: string;'));
  assert.ok(output.includes('name: string;'));
  assert.ok(output.includes('email: string | null;'));
  assert.ok(output.includes('export interface PostsTable'));
  assert.ok(output.includes('export interface Database'));
  assert.ok(output.includes('users: UsersTable;'));
  assert.ok(output.includes('posts: PostsTable;'));
});

test('generateTypes maps PostgreSQL types correctly', async () => {
  engine = new PGliteEngine(TEST_DIR);
  await engine.execute(`CREATE TABLE typed (
    a INTEGER NOT NULL,
    b BOOLEAN NOT NULL,
    c TIMESTAMP NOT NULL,
    d TEXT NOT NULL
  )`);

  const output = await generateTypes(engine);

  assert.ok(output.includes('a: number;'));
  assert.ok(output.includes('b: boolean;'));
  assert.ok(output.includes('c: Date;'));
  assert.ok(output.includes('d: string;'));
});

test('generateTypes excludes tables starting with _', async () => {
  engine = new PGliteEngine(TEST_DIR);
  await engine.execute('CREATE TABLE _internal (id TEXT PRIMARY KEY)');
  await engine.execute('CREATE TABLE visible (id TEXT PRIMARY KEY)');

  const output = await generateTypes(engine);

  assert.ok(!output.includes('InternalTable'));
  assert.ok(output.includes('VisibleTable'));
});

test('generateTypes returns minimal output for empty database', async () => {
  engine = new PGliteEngine(TEST_DIR);

  const output = await generateTypes(engine);

  assert.ok(output.includes('do not edit manually'));
  assert.ok(!output.includes('export interface Database'));
});
