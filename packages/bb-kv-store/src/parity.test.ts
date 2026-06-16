// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Regression tests for KVStore mock/browser parity and conditional operation correctness.
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { KVStore, KVStoreErrors } from './index.mock.js';
import { z } from 'zod';

beforeEach(() => {
	try { rmSync('.bb-data', { recursive: true, force: true }); } catch {}
});

// Browser entry must export error constants for client-side error handling

describe('browser entry exports error constants', () => {
	test('browser entry exports KVStoreErrors matching the mock', async () => {
		const browser = await import('./index.browser.js');
		assert.deepStrictEqual(
			(browser as any).KVStoreErrors,
			KVStoreErrors,
		);
	});
});

// Schema validation must run before conditional checks to match AWS behavior.
// The AWS entry validates client-side before sending to DynamoDB, so the mock
// must do the same — otherwise error-handling code written against the mock
// handles the wrong exception type in production.

describe('schema validation runs before conditional checks', () => {
	test('invalid value + ifNotExists on existing key throws ValidationFailed', async () => {
		
		const schema = z.object({ name: z.string().min(3) });
		const store = new KVStore({ id: 'root' } as any, 'val-order-1', { schema });

		await store.put('key1', { name: 'valid' } as any);

		await assert.rejects(
			() => store.put('key1', { name: 'x' } as any, { ifNotExists: true }),
			(err: any) => {
				assert.strictEqual(err.name, 'ValidationFailedException',
					'Schema validation must run first — invalid data should never reach the condition check');
				return true;
			},
		);
	});

	test('invalid value + ifValueEquals mismatch throws ValidationFailed', async () => {
		
		const schema = z.object({ count: z.number().min(0) });
		const store = new KVStore({ id: 'root' } as any, 'val-order-2', { schema });

		await store.put('counter', { count: 5 } as any);

		await assert.rejects(
			() => store.put('counter', { count: -1 } as any, { ifValueEquals: { count: 999 } as any }),
			(err: any) => {
				assert.strictEqual(err.name, 'ValidationFailedException');
				return true;
			},
		);
	});

	test('valid value + failing condition still throws ConditionalCheckFailed', async () => {
		
		const schema = z.object({ name: z.string().min(3) });
		const store = new KVStore({ id: 'root' } as any, 'val-order-3', { schema });

		await store.put('key1', { name: 'valid' } as any);

		await assert.rejects(
			() => store.put('key1', { name: 'also-valid' } as any, { ifNotExists: true }),
			(err: any) => {
				assert.strictEqual(err.name, KVStoreErrors.ConditionalCheckFailed);
				return true;
			},
		);
	});
});

// Passing { ifValueEquals: undefined } must be treated as "no condition".
// Using `'ifValueEquals' in obj` is true for explicit undefined, which causes
// a false ConditionalCheckFailed (mock) or SDK marshalling error (AWS).

describe('ifValueEquals: undefined is treated as no-op', () => {
	test('put with ifValueEquals: undefined overwrites normally', async () => {
		const store = new KVStore({ id: 'root' } as any, 'undef-put');
		await store.put('key1', 'hello');

		await store.put('key1', 'updated', { ifValueEquals: undefined } as any);
		assert.strictEqual(await store.get('key1'), 'updated');
	});

	test('put with ifValueEquals: undefined on new key succeeds', async () => {
		const store = new KVStore({ id: 'root' } as any, 'undef-put-new');

		await store.put('newkey', 'value', { ifValueEquals: undefined } as any);
		assert.strictEqual(await store.get('newkey'), 'value');
	});

	test('delete with ifValueEquals: undefined removes the key', async () => {
		const store = new KVStore({ id: 'root' } as any, 'undef-del');
		await store.put('key1', 'hello');

		await store.delete('key1', { ifValueEquals: undefined } as any);
		assert.strictEqual(await store.get('key1'), null);
	});

	test('delete with ifValueEquals: undefined on missing key succeeds silently', async () => {
		const store = new KVStore({ id: 'root' } as any, 'undef-del-new');
		await store.delete('nonexistent', { ifValueEquals: undefined } as any);
	});
});
