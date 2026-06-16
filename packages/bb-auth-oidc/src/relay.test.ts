// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { test, describe } from 'node:test';
import assert from 'node:assert';
import { relayOrigin, validateRelay, type RelayOrigin } from './relay.js';

const sameOriginUrl = new URL('https://api.myapp.com/auth/authorize-params/google');

describe('relayOrigin constructor', () => {
	test('accepts custom-scheme authority-only URI', () => {
		assert.strictEqual(relayOrigin('myapp://auth'), 'myapp://auth');
	});

	test('accepts HTTPS authority-only URI', () => {
		assert.strictEqual(relayOrigin('https://oauth.myapp.com'), 'https://oauth.myapp.com');
	});

	test('rejects path components', () => {
		assert.throws(() => relayOrigin('myapp://auth/callback'), /path components are not allowed/);
	});

	test('rejects query strings', () => {
		assert.throws(() => relayOrigin('https://oauth.myapp.com?foo=bar'), /query components are not allowed/);
	});

	test('rejects userinfo', () => {
		assert.throws(() => relayOrigin('https://user:pass@oauth.myapp.com'), /userinfo/);
	});

	test('rejects bare localhost', () => {
		assert.throws(() => relayOrigin('http://localhost:5000'), /'localhost' is not allowed/);
	});

	test('rejects empty string', () => {
		assert.throws(() => relayOrigin(''), /non-empty string/);
	});
});

describe('validateRelay', () => {
	const ALLOW: readonly RelayOrigin[] = [];
	const customScheme = relayOrigin('myapp://auth');

	test('loopback http://127.0.0.1 allowed without allowlist entry', () => {
		assert.deepStrictEqual(
			validateRelay('http://127.0.0.1:5234', { allowList: ALLOW, sameOrigin: sameOriginUrl }),
			{ allowed: true },
		);
	});

	test('loopback http://[::1] allowed', () => {
		assert.deepStrictEqual(
			validateRelay('http://[::1]:7000', { allowList: ALLOW, sameOrigin: sameOriginUrl }),
			{ allowed: true },
		);
	});

	test('same-origin allowed', () => {
		assert.deepStrictEqual(
			validateRelay('https://api.myapp.com', { allowList: ALLOW, sameOrigin: sameOriginUrl }),
			{ allowed: true },
		);
	});

	test('custom scheme in allowlist allowed', () => {
		assert.deepStrictEqual(
			validateRelay('myapp://auth', { allowList: [customScheme], sameOrigin: sameOriginUrl }),
			{ allowed: true },
		);
	});

	test('custom scheme with path in allowlist allowed (path preserved through relay)', () => {
		assert.deepStrictEqual(
			validateRelay('myapp://auth/callback', { allowList: [customScheme], sameOrigin: sameOriginUrl }),
			{ allowed: true },
		);
	});

	test('loopback with path allowed', () => {
		assert.deepStrictEqual(
			validateRelay('http://127.0.0.1:9876/callback', { allowList: ALLOW, sameOrigin: sameOriginUrl }),
			{ allowed: true },
		);
	});

	test('malformed URI → malformed', () => {
		assert.deepStrictEqual(
			validateRelay('not a uri', { allowList: ALLOW, sameOrigin: sameOriginUrl }),
			{ allowed: false, reason: 'malformed' },
		);
	});

	test('relayTo with path on unknown scheme → unknown-origin (path ignored, origin checked)', () => {
		assert.deepStrictEqual(
			validateRelay('myapp://auth/callback', { allowList: ALLOW, sameOrigin: sameOriginUrl }),
			{ allowed: false, reason: 'unknown-origin' },
		);
	});

	test('plain HTTP non-loopback → plaintext-non-loopback', () => {
		assert.deepStrictEqual(
			validateRelay('http://example.com:8080', { allowList: ALLOW, sameOrigin: sameOriginUrl }),
			{ allowed: false, reason: 'plaintext-non-loopback' },
		);
	});

	test('custom scheme not in allowlist → unknown-origin', () => {
		assert.deepStrictEqual(
			validateRelay('evilapp://auth', { allowList: ALLOW, sameOrigin: sameOriginUrl }),
			{ allowed: false, reason: 'unknown-origin' },
		);
	});
});
