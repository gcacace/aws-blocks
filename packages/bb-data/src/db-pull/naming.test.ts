// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, test } from 'node:test';
import assert from 'node:assert';
import { camelCase, capitalize, pascalCase, pgTypeToTs, resolveSingular } from './naming.js';

describe('pgTypeToTs', () => {
  test('maps known Postgres types (case-insensitive)', () => {
    assert.equal(pgTypeToTs('integer'), 'number');
    assert.equal(pgTypeToTs('UUID'), 'string');
    assert.equal(pgTypeToTs('timestamp with time zone'), 'string');
    assert.equal(pgTypeToTs('jsonb'), 'Record<string, unknown>');
    assert.equal(pgTypeToTs('boolean'), 'boolean');
  });

  test('falls back to unknown for unmapped types', () => {
    assert.equal(pgTypeToTs('geometry'), 'unknown');
    assert.equal(pgTypeToTs(''), 'unknown');
  });
});

describe('capitalize', () => {
  test('uppercases only the first character, leaving the rest unchanged', () => {
    assert.equal(capitalize('todo'), 'Todo');
    assert.equal(capitalize('userProfile'), 'UserProfile');
    assert.equal(capitalize('A'), 'A');
    assert.equal(capitalize(''), '');
  });
});

describe('pascalCase / camelCase', () => {
  test('pascalCase upper-cases each underscore-separated segment', () => {
    assert.equal(pascalCase('order_items'), 'OrderItems');
    assert.equal(pascalCase('todos'), 'Todos');
  });

  test('camelCase lower-cases the first segment, drops empty segments', () => {
    assert.equal(camelCase('order_items'), 'orderItems');
    assert.equal(camelCase('migration_test_todos'), 'migrationTestTodos');
    assert.equal(camelCase('__weird__name__'), 'weirdName');
  });
});

describe('resolveSingular', () => {
  test('derives a camelCase singular from the table name when not preserved', () => {
    assert.equal(resolveSingular('todos'), 'todo');
    assert.equal(resolveSingular('categories'), 'category');
    // Compound names singularize the last word, then camelCase the whole.
    assert.equal(resolveSingular('order_items'), 'orderItem');
  });

  test('preserves a hand-edited singular when present (D6 / PR #787)', () => {
    const existing = new Map([['todos', 'customThing']]);
    assert.equal(resolveSingular('todos', existing), 'customThing');
  });

  test('falls back to derivation when the map lacks the table', () => {
    const existing = new Map([['other', 'whatever']]);
    assert.equal(resolveSingular('todos', existing), 'todo');
  });
});
