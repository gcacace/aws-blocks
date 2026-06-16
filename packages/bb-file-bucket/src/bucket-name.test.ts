// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Tests for the shared S3 bucket-name validator and its enforcement in the
 * mock entry point. The CDK side is covered in index.cdk.test.ts; this file
 * pins the validator rules and the local-dev (mock) parity behavior.
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { Scope, isBlocksError } from '@aws-blocks/core';
import { validateBucketName } from './bucket-name.js';
import { FileBucket } from './index.mock.js';

// ── Validator unit tests ─────────────────────────────────────────────────────

test('accepts a valid lowercase hyphenated name', () => {
	assert.doesNotThrow(() => validateBucketName('myapp-uploads'));
});

test('accepts a name at exactly 63 characters', () => {
	const name = 'a'.repeat(63);
	assert.doesNotThrow(() => validateBucketName(name));
});

test('rejects a name over 63 characters with an actionable message', () => {
	const name = 'a'.repeat(64);
	assert.throws(
		() => validateBucketName(name),
		(err: unknown) =>
			isBlocksError(err, 'ValidationFailed') &&
			/64 characters/.test((err as Error).message) &&
			/63-character limit/.test((err as Error).message) &&
			/Shorten/.test((err as Error).message),
	);
});

test('rejects a name under 3 characters', () => {
	assert.throws(
		() => validateBucketName('ab'),
		(err: unknown) => isBlocksError(err, 'ValidationFailed') && /at least 3/.test((err as Error).message),
	);
});

test('rejects uppercase characters', () => {
	assert.throws(
		() => validateBucketName('MyApp-Uploads'),
		(err: unknown) => isBlocksError(err, 'ValidationFailed') && /lowercase/.test((err as Error).message),
	);
});

test('rejects underscores', () => {
	assert.throws(
		() => validateBucketName('my_app_uploads'),
		(err: unknown) => isBlocksError(err, 'ValidationFailed'),
	);
});

test('rejects a name not starting with a letter or number', () => {
	assert.throws(
		() => validateBucketName('-myapp'),
		(err: unknown) => isBlocksError(err, 'ValidationFailed') && /begin and end/.test((err as Error).message),
	);
});

test('rejects a name not ending with a letter or number', () => {
	assert.throws(
		() => validateBucketName('myapp-'),
		(err: unknown) => isBlocksError(err, 'ValidationFailed') && /begin and end/.test((err as Error).message),
	);
});

test('rejects adjacent dots', () => {
	assert.throws(
		() => validateBucketName('my..app'),
		(err: unknown) => isBlocksError(err, 'ValidationFailed') && /adjacent dots/.test((err as Error).message),
	);
});

// ── Mock parity: construction enforces the same rules ────────────────────────

test('mock: constructing a FileBucket with a too-long derived name throws', () => {
	// Parent id + child id joined with "-" must exceed 63 chars.
	const longParent = new Scope('p'.repeat(60));
	assert.throws(
		() => new FileBucket(longParent, 'uploads'),
		(err: unknown) => isBlocksError(err, 'ValidationFailed') && /63-character limit/.test((err as Error).message),
	);
});

test('mock: constructing a FileBucket with a valid derived name succeeds', () => {
	const parent = new Scope('shortapp');
	assert.doesNotThrow(() => new FileBucket(parent, 'uploads'));
});

test('mock: fromExisting bypasses derived-name validation', () => {
	// An over-long scope chain would normally fail, but fromExisting wraps an
	// externally-named bucket so the derived name is not used.
	const longParent = new Scope('p'.repeat(60));
	assert.doesNotThrow(() =>
		new FileBucket(longParent, 'uploads', { bucket: FileBucket.fromExisting('preexisting-bucket-123') }),
	);
});
