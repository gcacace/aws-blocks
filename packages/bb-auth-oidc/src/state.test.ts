// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
	encodeState,
	decodeState,
	type StatePayload,
	type StatePayloadV1,
} from './state.js';

const SECRET = 'test-secret-for-state-tests-only';

describe('state envelope', () => {
	test('round-trips a payload with all fields', () => {
		const payload: StatePayloadV1 = { v: 1, csrf: 'csrf-value-32-chars-minimum-ok!', relay: 'myapp://auth', app: 'user-state' };
		const encoded = encodeState(payload, SECRET);
		const result = decodeState(encoded, SECRET);
		assert.deepStrictEqual(result, { ok: true, payload });
	});

	test('round-trips with only required fields', () => {
		const payload: StatePayloadV1 = { v: 1, csrf: 'just-csrf' };
		const encoded = encodeState(payload, SECRET);
		const result = decodeState(encoded, SECRET);
		assert.deepStrictEqual(result, { ok: true, payload });
	});

	test('canonical encoding: undefined fields produce same bytes as absent fields', () => {
		const withUndefined: StatePayload = { v: 1, csrf: 'x', relay: undefined, app: undefined };
		const withoutFields: StatePayload = { v: 1, csrf: 'x' };
		assert.strictEqual(encodeState(withUndefined, SECRET), encodeState(withoutFields, SECRET));
	});

	test('tampered body returns signature failure', () => {
		const encoded = encodeState({ v: 1, csrf: 'csrf-val' }, SECRET);
		const [body, sig] = encoded.split('.');
		const tampered = `${body}X.${sig}`;
		assert.deepStrictEqual(decodeState(tampered, SECRET), { ok: false, reason: 'signature' });
	});

	test('wrong secret returns signature failure', () => {
		const encoded = encodeState({ v: 1, csrf: 'csrf-val' }, SECRET);
		assert.deepStrictEqual(decodeState(encoded, 'wrong-secret'), { ok: false, reason: 'signature' });
	});

	test('unknown version returns version failure', () => {
		const encoded = encodeState({ v: 99, csrf: 'x' } as any, SECRET);
		assert.deepStrictEqual(decodeState(encoded, SECRET), { ok: false, reason: 'version' });
	});

	test('malformed envelope (no separator) returns malformed', () => {
		assert.deepStrictEqual(decodeState('noseparator', SECRET), { ok: false, reason: 'malformed' });
	});
});
