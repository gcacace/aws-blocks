// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { test, describe } from 'node:test';
import assert from 'node:assert';
import { safeStringArrayClaim, safeStringClaim } from './sessions.js';

describe('safeStringClaim', () => {
	test('returns the string value when the claim is a string', () => {
		assert.strictEqual(safeStringClaim({ sub: 'abc' }, 'sub'), 'abc');
	});

	test('returns empty string when the claim is missing', () => {
		assert.strictEqual(safeStringClaim({}, 'sub'), '');
	});

	test('returns fallback when the claim is missing', () => {
		assert.strictEqual(safeStringClaim({}, 'sub', 'default'), 'default');
	});

	test('returns fallback when the claim is a number', () => {
		assert.strictEqual(safeStringClaim({ sub: 42 }, 'sub', 'default'), 'default');
	});

	test('returns fallback when the claim is an array', () => {
		assert.strictEqual(safeStringClaim({ sub: ['a'] }, 'sub', 'default'), 'default');
	});

	test('returns fallback when the claim is an object', () => {
		assert.strictEqual(safeStringClaim({ sub: { x: 1 } }, 'sub', 'default'), 'default');
	});

	test('returns fallback when the claim is null', () => {
		assert.strictEqual(safeStringClaim({ sub: null }, 'sub', 'default'), 'default');
	});
});

describe('safeStringArrayClaim', () => {
	test('returns the array when every element is a string', () => {
		assert.deepStrictEqual(
			safeStringArrayClaim({ groups: ['admin', 'editor'] }, 'groups'),
			['admin', 'editor'],
		);
	});

	test('returns empty array when the claim is missing', () => {
		assert.deepStrictEqual(safeStringArrayClaim({}, 'groups'), []);
	});

	test('returns fallback when the claim is missing', () => {
		assert.deepStrictEqual(
			safeStringArrayClaim({}, 'groups', ['default']),
			['default'],
		);
	});

	test('filters non-string entries out of a mixed-type array', () => {
		assert.deepStrictEqual(
			safeStringArrayClaim({ groups: ['admin', 1, 'editor', null, {}] }, 'groups'),
			['admin', 'editor'],
		);
	});

	test('returns fallback when the claim is not an array', () => {
		assert.deepStrictEqual(
			safeStringArrayClaim({ groups: 'admin' }, 'groups', ['fallback']),
			['fallback'],
		);
	});

	test('returns empty array when the array has no string elements', () => {
		assert.deepStrictEqual(
			safeStringArrayClaim({ groups: [1, 2, null] }, 'groups'),
			[],
		);
	});
});
