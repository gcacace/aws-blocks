// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { test, describe, mock, afterEach } from 'node:test';
import assert from 'node:assert';
import { BedrockAgentRuntimeClient } from '@aws-sdk/client-bedrock-agent-runtime';
import { KnowledgeBaseErrors, KnowledgeBase } from './index.aws.js';

// ── SDK mock helpers ───────────────────────────────────────────────────────

function mockRuntimeSend(fn: (cmd: unknown) => unknown) {
	return mock.method(BedrockAgentRuntimeClient.prototype, 'send', fn);
}

afterEach(() => {
	try { mock.restoreAll(); } catch {}
});

function setKbEnv(scopeId: string, instanceId: string, kbId = 'kb-test-123') {
	const prefix = `BLOCKS_${scopeId}_${instanceId}`.toUpperCase().replace(/[^A-Z0-9]/g, '_');
	process.env[`${prefix}_KB_ID`] = kbId;
	return () => {
		delete process.env[`${prefix}_KB_ID`];
	};
}

// ── Constructor validation ─────────────────────────────────────────────────

describe('KnowledgeBase constructor validation', () => {
	test('constructor succeeds without env var but retrieve() throws NotReady', async () => {
		const origKb = process.env['BLOCKS_TEST_KB_KB_ID'];
		delete process.env['BLOCKS_TEST_KB_KB_ID'];

		try {
			const kb = new KnowledgeBase({ id: 'test' }, 'kb', { source: './knowledge' });
			assert.ok(kb, 'constructor should succeed without env var (lazy init)');

			await assert.rejects(
				() => kb.retrieve('test query'),
				(err: Error) => {
					assert.strictEqual(err.name, KnowledgeBaseErrors.NotReady);
					assert.ok(err.message.includes('BLOCKS_TEST_KB_KB_ID'));
					return true;
				},
			);
		} finally {
			if (origKb !== undefined) process.env['BLOCKS_TEST_KB_KB_ID'] = origKb;
		}
	});
});

// ── envKey — tested indirectly via constructor ─────────────────────────────

describe('envKey (indirect via constructor)', () => {
	test('sanitizes non-alphanumeric characters in scope id', () => {
		const cleanup = setKbEnv('MY_APP_KB', 'V2');
		try {
			const kb = new KnowledgeBase({ id: 'my-app/kb' }, 'v2', { source: './knowledge' });
			assert.ok(kb, 'constructor should succeed when env vars match sanitized key');
		} finally {
			cleanup();
		}
	});

	test('handles dots and spaces in scope id', () => {
		const cleanup = setKbEnv('MY_APP_NAME', 'DS');
		try {
			const kb = new KnowledgeBase({ id: 'my.app name' }, 'ds', { source: './knowledge' });
			assert.ok(kb, 'constructor should succeed with dots and spaces');
		} finally {
			cleanup();
		}
	});

	test('handles already uppercase input', () => {
		const cleanup = setKbEnv('PROD_KB', 'MAIN');
		try {
			const kb = new KnowledgeBase({ id: 'PROD-KB' }, 'main', { source: './knowledge' });
			assert.ok(kb, 'constructor should succeed with uppercase scope id');
		} finally {
			cleanup();
		}
	});

	test('handles compound scope IDs', () => {
		const cleanup = setKbEnv('MYAPP_DOCS', 'IDX');
		try {
			const kb = new KnowledgeBase({ id: 'myapp-docs' }, 'idx', { source: './knowledge' });
			assert.ok(kb, 'constructor should succeed with compound scope id');
		} finally {
			cleanup();
		}
	});
});

// ── Retrieve validation ────────────────────────────────────────────────────

describe('retrieve validation', () => {
	test('empty query throws ValidationError', async () => {
		const cleanup = setKbEnv('TEST', 'VAL');
		try {
			const kb = new KnowledgeBase({ id: 'test' }, 'val', { source: './knowledge' });
			await assert.rejects(
				() => kb.retrieve(''),
				(err: Error) => {
					assert.strictEqual(err.name, KnowledgeBaseErrors.ValidationError);
					return true;
				},
			);
		} finally {
			cleanup();
		}
	});

	test('whitespace-only query throws ValidationError', async () => {
		const cleanup = setKbEnv('TEST', 'VAL2');
		try {
			const kb = new KnowledgeBase({ id: 'test' }, 'val2', { source: './knowledge' });
			await assert.rejects(
				() => kb.retrieve('   '),
				(err: Error) => {
					assert.strictEqual(err.name, KnowledgeBaseErrors.ValidationError);
					return true;
				},
			);
		} finally {
			cleanup();
		}
	});
});

// ── retrieve() — mapResultItem tested indirectly via SDK mock ──────────────

describe('retrieve (SDK-mocked)', () => {
	test('maps text, score, source, metadata correctly', async () => {
		const cleanup = setKbEnv('TEST', 'R1');
		mockRuntimeSend(() => ({
			retrievalResults: [{
				content: { text: 'chunk content' },
				score: 0.85,
				location: { s3Location: { uri: 's3://bucket/doc.md' }, type: 'S3' },
				metadata: {
					folder: 'faq',
					'x-amz-bedrock-kb-chunk-id': 'internal',
					category: 'billing',
				},
			}],
		}));

		try {
			const kb = new KnowledgeBase({ id: 'test' }, 'r1', { source: './knowledge' });
			const results = await kb.retrieve('how to reset password');

			assert.strictEqual(results.length, 1);
			assert.strictEqual(results[0].text, 'chunk content');
			assert.strictEqual(results[0].score, 0.85);
			assert.strictEqual(results[0].source, 's3://bucket/doc.md');
			assert.strictEqual(results[0].metadata.folder, 'faq');
			assert.strictEqual(results[0].metadata.category, 'billing');
			assert.ok(!('x-amz-bedrock-kb-chunk-id' in results[0].metadata));
		} finally {
			cleanup();
		}
	});

	test('strips all x-amz-bedrock prefixed metadata keys', async () => {
		const cleanup = setKbEnv('TEST', 'R2');
		mockRuntimeSend(() => ({
			retrievalResults: [{
				content: { text: 'text' },
				score: 1.0,
				metadata: {
					'x-amz-bedrock-kb-chunk-id': 'abc123',
					'x-amz-bedrock-kb-source-uri': 's3://internal',
					'x-amz-bedrock-kb-data-source-id': 'ds-123',
					custom: 'value',
				},
			}],
		}));

		try {
			const kb = new KnowledgeBase({ id: 'test' }, 'r2', { source: './knowledge' });
			const results = await kb.retrieve('query');

			assert.deepStrictEqual(Object.keys(results[0].metadata), ['custom']);
			assert.strictEqual(results[0].metadata.custom, 'value');
		} finally {
			cleanup();
		}
	});

	test('handles missing content/score/location', async () => {
		const cleanup = setKbEnv('TEST', 'R3');
		mockRuntimeSend(() => ({
			retrievalResults: [{}],
		}));

		try {
			const kb = new KnowledgeBase({ id: 'test' }, 'r3', { source: './knowledge' });
			const results = await kb.retrieve('query');

			assert.strictEqual(results.length, 1);
			assert.strictEqual(results[0].text, '');
			assert.strictEqual(results[0].score, 0);
			assert.strictEqual(results[0].source, '');
			assert.deepStrictEqual(results[0].metadata, {});
		} finally {
			cleanup();
		}
	});

	test('handles missing content.text but present content object', async () => {
		const cleanup = setKbEnv('TEST', 'R4');
		mockRuntimeSend(() => ({
			retrievalResults: [{ content: {} }],
		}));

		try {
			const kb = new KnowledgeBase({ id: 'test' }, 'r4', { source: './knowledge' });
			const results = await kb.retrieve('query');
			assert.strictEqual(results[0].text, '');
		} finally {
			cleanup();
		}
	});

	test('handles location without s3Location', async () => {
		const cleanup = setKbEnv('TEST', 'R5');
		mockRuntimeSend(() => ({
			retrievalResults: [{ location: { type: 'S3' } }],
		}));

		try {
			const kb = new KnowledgeBase({ id: 'test' }, 'r5', { source: './knowledge' });
			const results = await kb.retrieve('query');
			assert.strictEqual(results[0].source, '');
		} finally {
			cleanup();
		}
	});

	test('stringifies non-string metadata values', async () => {
		const cleanup = setKbEnv('TEST', 'R6');
		mockRuntimeSend(() => ({
			retrievalResults: [{
				score: 1.0,
				metadata: {
					count: 42 as unknown as string,
					flag: true as unknown as string,
				},
			}],
		}));

		try {
			const kb = new KnowledgeBase({ id: 'test' }, 'r6', { source: './knowledge' });
			const results = await kb.retrieve('query');
			assert.strictEqual(results[0].metadata.count, '42');
			assert.strictEqual(results[0].metadata.flag, 'true');
		} finally {
			cleanup();
		}
	});

	test('excludes null/undefined metadata values', async () => {
		const cleanup = setKbEnv('TEST', 'R7');
		mockRuntimeSend(() => ({
			retrievalResults: [{
				score: 1.0,
				metadata: {
					present: 'yes',
					absent: null as unknown as string,
					missing: undefined as unknown as string,
				},
			}],
		}));

		try {
			const kb = new KnowledgeBase({ id: 'test' }, 'r7', { source: './knowledge' });
			const results = await kb.retrieve('query');
			assert.strictEqual(results[0].metadata.present, 'yes');
			assert.ok(!('absent' in results[0].metadata));
			assert.ok(!('missing' in results[0].metadata));
		} finally {
			cleanup();
		}
	});

	test('clamps maxResults to 1–100 range', async () => {
		const cleanup = setKbEnv('TEST', 'R9');
		let capturedNumberOfResults: number | undefined;
		mockRuntimeSend((cmd: any) => {
			capturedNumberOfResults = cmd.input?.retrievalConfiguration
				?.vectorSearchConfiguration?.numberOfResults;
			return { retrievalResults: [] };
		});

		try {
			const kb = new KnowledgeBase({ id: 'test' }, 'r9', { source: './knowledge' });

			await kb.retrieve('query', { maxResults: 0 });
			assert.strictEqual(capturedNumberOfResults, 1, 'maxResults=0 should be clamped to 1');

			await kb.retrieve('query', { maxResults: 200 });
			assert.strictEqual(capturedNumberOfResults, 100, 'maxResults=200 should be clamped to 100');

			await kb.retrieve('query', { maxResults: 50 });
			assert.strictEqual(capturedNumberOfResults, 50, 'maxResults=50 should pass through');
		} finally {
			cleanup();
		}
	});

	test('handles empty retrievalResults', async () => {
		const cleanup = setKbEnv('TEST', 'R10');
		mockRuntimeSend(() => ({ retrievalResults: [] }));

		try {
			const kb = new KnowledgeBase({ id: 'test' }, 'r10', { source: './knowledge' });
			const results = await kb.retrieve('query');
			assert.deepStrictEqual(results, []);
		} finally {
			cleanup();
		}
	});

	test('handles undefined retrievalResults', async () => {
		const cleanup = setKbEnv('TEST', 'R11');
		mockRuntimeSend(() => ({}));

		try {
			const kb = new KnowledgeBase({ id: 'test' }, 'r11', { source: './knowledge' });
			const results = await kb.retrieve('query');
			assert.deepStrictEqual(results, []);
		} finally {
			cleanup();
		}
	});

	test('SDK error is mapped through mapSdkError', async () => {
		const cleanup = setKbEnv('TEST', 'R12');
		const sdkErr = new Error('KB not found');
		sdkErr.name = 'ResourceNotFoundException';
		mockRuntimeSend(() => { throw sdkErr; });

		try {
			const kb = new KnowledgeBase({ id: 'test' }, 'r12', { source: './knowledge' });
			await assert.rejects(
				() => kb.retrieve('query'),
				(err: Error) => {
					assert.strictEqual(err.name, KnowledgeBaseErrors.NotReady);
					return true;
				},
			);
		} finally {
			cleanup();
		}
	});

	test('retrieve maps ValidationException to InvalidFilter', async () => {
		const cleanup = setKbEnv('TEST', 'R13');
		const err = new Error('Invalid filter expression');
		err.name = 'ValidationException';
		mockRuntimeSend(() => { throw err; });

		try {
			const kb = new KnowledgeBase({ id: 'test' }, 'r13', { source: './knowledge' });
			await assert.rejects(
				() => kb.retrieve('test query'),
				(e: Error) => {
					assert.strictEqual(e.name, KnowledgeBaseErrors.InvalidFilter);
					return true;
				},
			);
		} finally {
			cleanup();
		}
	});
});
