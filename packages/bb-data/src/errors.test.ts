// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { test } from 'node:test';
import assert from 'node:assert';
import { DatabaseErrors, wrapError } from './errors.js';

test('DatabaseErrors has all expected keys', () => {
  assert.strictEqual(DatabaseErrors.QueryFailed, 'QueryFailedException');
  assert.strictEqual(DatabaseErrors.ConnectionFailed, 'ConnectionFailedException');
  assert.strictEqual(DatabaseErrors.TransactionFailed, 'TransactionFailedException');
  assert.strictEqual(DatabaseErrors.UniqueConstraintViolation, 'UniqueConstraintViolationException');
});

test('wrapError preserves errors with a known DatabaseErrors name', () => {
  const original = new Error('duplicate key');
  original.name = DatabaseErrors.UniqueConstraintViolation;

  assert.throws(
    () => wrapError(original),
    (err: Error) => {
      assert.strictEqual(err.name, DatabaseErrors.UniqueConstraintViolation);
      assert.strictEqual(err.message, 'duplicate key');
      return true;
    }
  );
});

test('wrapError sets unknown error names to QueryFailed', () => {
  const original = new Error('something broke');
  original.name = 'SomeRandomError';

  assert.throws(
    () => wrapError(original),
    (err: Error) => {
      assert.strictEqual(err.name, DatabaseErrors.QueryFailed);
      assert.strictEqual(err.message, 'something broke');
      return true;
    }
  );
});

test('wrapError converts non-Error values to Error with QueryFailed', () => {
  assert.throws(
    () => wrapError('a string error'),
    (err: Error) => {
      assert.strictEqual(err.name, DatabaseErrors.QueryFailed);
      assert.strictEqual(err.message, 'a string error');
      return true;
    }
  );
});

test('wrapError always throws', () => {
  assert.throws(() => wrapError(new Error('test')));
});
