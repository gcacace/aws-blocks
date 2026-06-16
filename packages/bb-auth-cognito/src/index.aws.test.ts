// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, test } from 'node:test';
import assert from 'node:assert';
import { extractUserAttributes } from './index.aws.js';

describe('extractUserAttributes (JWT allow-shape)', () => {
	test('passes through standard OIDC attributes', () => {
		const out = extractUserAttributes({
			email: 'alice@example.com',
			email_verified: 'true',
			phone_number: '+15555550100',
			name: 'Alice',
		});
		assert.deepStrictEqual(out, {
			email: 'alice@example.com',
			email_verified: 'true',
			phone_number: '+15555550100',
			name: 'Alice',
		});
	});

	test('passes through custom: attributes', () => {
		const out = extractUserAttributes({
			'custom:department': 'eng',
			'custom:employeeId': '12345',
		});
		assert.deepStrictEqual(out, {
			'custom:department': 'eng',
			'custom:employeeId': '12345',
		});
	});

	test('drops cognito:-prefixed claims', () => {
		const out = extractUserAttributes({
			'cognito:username': 'alice',
			'cognito:groups': 'admins',
			email: 'alice@example.com',
		});
		assert.deepStrictEqual(out, { email: 'alice@example.com' });
	});

	test('drops reserved JWT + Cognito lifecycle claims', () => {
		const out = extractUserAttributes({
			sub: 'abc-123',
			iss: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_XXX',
			aud: 'client-id',
			iat: 1234567890,
			exp: 1234567890,
			nbf: 1234567890,
			jti: 'jti-abc',
			token_use: 'id',
			auth_time: 1234567890,
			origin_jti: 'origin-abc',
			event_id: 'event-abc',
			email: 'alice@example.com',
		});
		assert.deepStrictEqual(out, { email: 'alice@example.com' });
	});

	test('drops non-string values (e.g. claim arrays, numbers)', () => {
		const out = extractUserAttributes({
			email: 'alice@example.com',
			'cognito:groups': ['admins', 'readers'],
			some_number_claim: 42,
			some_bool_claim: true,
			some_object_claim: { nested: 'value' },
		});
		// Only the string `email` should pass.
		assert.deepStrictEqual(out, { email: 'alice@example.com' });
	});

	test('allows a hypothetical new standard OIDC attribute automatically', () => {
		// Forward-compat: when AWS adds a new non-cognito:, non-reserved standard
		// claim (e.g. a new OIDC spec attribute), it flows through without a
		// library update. The helper drops only known-reserved names + the
		// cognito: prefix; everything else is customer-visible.
		const out = extractUserAttributes({
			hypothetical_future_standard_claim: 'value',
			email: 'alice@example.com',
		});
		assert.deepStrictEqual(out, {
			hypothetical_future_standard_claim: 'value',
			email: 'alice@example.com',
		});
	});
});
