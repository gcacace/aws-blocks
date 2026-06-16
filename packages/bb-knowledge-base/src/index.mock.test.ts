// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { test, beforeEach, describe } from 'node:test';
import assert from 'node:assert';
import { rmSync, existsSync, mkdirSync, writeFileSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { KnowledgeBase, KnowledgeBaseErrors } from './index.mock.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = join(__dirname, '..');
const FIXTURES_SRC = join(PKG_ROOT, 'test-fixtures', 'knowledge');
const TEST_KNOWLEDGE_NAME = 'test-knowledge-tmp';
const TEST_KNOWLEDGE = join(process.cwd(), TEST_KNOWLEDGE_NAME);

function setupTestFixtures(): void {
	if (existsSync(TEST_KNOWLEDGE)) rmSync(TEST_KNOWLEDGE, { recursive: true, force: true });
	cpSync(FIXTURES_SRC, TEST_KNOWLEDGE, { recursive: true });
}

function cleanup(): void {
	try { rmSync('.bb-data', { recursive: true, force: true }); } catch {}
	try { rmSync(TEST_KNOWLEDGE, { recursive: true, force: true }); } catch {}
}

beforeEach(() => {
	cleanup();
	setupTestFixtures();
});

// ── Basic retrieve ─────────────────────────────────────────────────────────

test('retrieve returns results matching query terms', async () => {
	const kb = new KnowledgeBase({ id: 'test' }, 'kb', { source: 'test-knowledge-tmp' });
	const results = await kb.retrieve('password reset');

	assert.ok(results.length > 0, 'should return results');
	assert.ok(
		results[0].text.toLowerCase().includes('password'),
		'top result should contain password',
	);
});

test('retrieve returns results for billing query', async () => {
	const kb = new KnowledgeBase({ id: 'test' }, 'kb', { source: 'test-knowledge-tmp' });
	const results = await kb.retrieve('billing payment invoice');

	assert.ok(results.length > 0, 'should return results');
	assert.ok(
		results.some(r => r.source.includes('billing')),
		'should include billing source',
	);
});

// ── Score ordering ─────────────────────────────────────────────────────────

test('results are sorted by score descending', async () => {
	const kb = new KnowledgeBase({ id: 'test' }, 'kb', { source: 'test-knowledge-tmp' });
	const results = await kb.retrieve('API authentication token');

	assert.ok(results.length >= 2, 'should return multiple results');
	for (let i = 1; i < results.length; i++) {
		assert.ok(
			results[i - 1].score >= results[i].score,
			`score[${i - 1}] (${results[i - 1].score}) should be >= score[${i}] (${results[i].score})`,
		);
	}
});

// ── maxResults ─────────────────────────────────────────────────────────────

test('maxResults limits number of returned results', async () => {
	const kb = new KnowledgeBase({ id: 'test' }, 'kb', { source: 'test-knowledge-tmp' });
	const results = await kb.retrieve('the', { maxResults: 2 });

	assert.ok(results.length <= 2, 'should return at most 2');
});

test('maxResults is clamped to [1, 100]', async () => {
	const kb = new KnowledgeBase({ id: 'test' }, 'kb', { source: 'test-knowledge-tmp' });

	const results0 = await kb.retrieve('password', { maxResults: 0 });
	assert.ok(results0.length >= 1, 'maxResults=0 should clamp to 1');

	const resultsNeg = await kb.retrieve('password', { maxResults: -5 });
	assert.ok(resultsNeg.length >= 1, 'negative maxResults should clamp to 1');
});

// ── Empty results ──────────────────────────────────────────────────────────

test('unrelated query returns empty array', async () => {
	const kb = new KnowledgeBase({ id: 'test' }, 'kb', { source: 'test-knowledge-tmp' });
	const results = await kb.retrieve('xyzzy quantum entanglement supercalifragilistic');

	assert.strictEqual(results.length, 0, 'should return no results');
});

// ── Subfolder → folder metadata ────────────────────────────────────────────

test('faq files get folder metadata "faq"', async () => {
	const kb = new KnowledgeBase({ id: 'test' }, 'kb', { source: 'test-knowledge-tmp' });
	const results = await kb.retrieve('password reset');

	const faqResult = results.find(r => r.source.includes('faq/'));
	assert.ok(faqResult, 'should have result from faq folder');
	assert.strictEqual(faqResult.metadata.folder, 'faq', 'folder metadata should be "faq"');
});

test('nested subfolder gets first-level folder as folder metadata', async () => {
	const kb = new KnowledgeBase({ id: 'test' }, 'kb', { source: 'test-knowledge-tmp' });
	const results = await kb.retrieve('API authentication OAuth');

	const advancedResult = results.find(r => r.source.includes('guides/advanced/'));
	assert.ok(advancedResult, 'should have result from guides/advanced');
	assert.strictEqual(
		advancedResult.metadata.folder,
		'guides',
		'nested folder metadata should be first-level folder "guides"',
	);
});

test('root-level files have no folder metadata', async () => {
	const kb = new KnowledgeBase({ id: 'test' }, 'kb', { source: 'test-knowledge-tmp' });
	const results = await kb.retrieve('release notes performance improvements');

	const rootResult = results.find(r => r.source === 'release-notes.txt');
	assert.ok(rootResult, 'should have result from root file');
	assert.strictEqual(rootResult.metadata.folder, undefined, 'root file should have no folder metadata');
});

// ── Metadata filter ────────────────────────────────────────────────────────

test('metadata filter restricts results to matching folder', async () => {
	const kb = new KnowledgeBase({ id: 'test' }, 'kb', { source: 'test-knowledge-tmp' });
	const results = await kb.retrieve('password billing guide', {
		filter: { folder: { equals: 'faq' } },
	});

	assert.ok(results.length > 0, 'should return results');
	for (const r of results) {
		assert.strictEqual(r.metadata.folder, 'faq', 'all results should be from faq folder');
	}
});

test('non-existent filter value returns empty array', async () => {
	const kb = new KnowledgeBase({ id: 'test' }, 'kb', { source: 'test-knowledge-tmp' });
	const results = await kb.retrieve('password', {
		filter: { folder: { equals: 'nonexistent' } },
	});

	assert.strictEqual(results.length, 0);
});

// ── RetrieveResult shape ───────────────────────────────────────────────────

test('RetrieveResult has all required fields with correct types', async () => {
	const kb = new KnowledgeBase({ id: 'test' }, 'kb', { source: 'test-knowledge-tmp' });
	const results = await kb.retrieve('password');

	assert.ok(results.length > 0);
	const r = results[0];
	assert.strictEqual(typeof r.text, 'string', 'text should be string');
	assert.ok(r.text.length > 0, 'text should be non-empty');
	assert.strictEqual(typeof r.score, 'number', 'score should be number');
	assert.ok(r.score >= 0 && r.score <= 1, 'score should be in [0, 1]');
	assert.strictEqual(typeof r.source, 'string', 'source should be string');
	assert.ok(r.source.length > 0, 'source should be non-empty');
	assert.strictEqual(typeof r.metadata, 'object', 'metadata should be object');
	assert.ok(r.metadata !== null, 'metadata should not be null');
});

// ── Persistence ────────────────────────────────────────────────────────────

test('second instance loads from chunks.json cache', async () => {
	const kb1 = new KnowledgeBase({ id: 'test' }, 'persist', { source: 'test-knowledge-tmp' });
	const results1 = await kb1.retrieve('password');
	assert.ok(results1.length > 0);

	assert.ok(
		existsSync(join('.bb-data', 'test-persist', 'chunks.json')),
		'chunks.json cache should exist',
	);

	// Delete the source folder to prove we're loading from cache
	rmSync(TEST_KNOWLEDGE, { recursive: true, force: true });

	const kb2 = new KnowledgeBase({ id: 'test' }, 'persist', { source: 'test-knowledge-tmp' });
	const results2 = await kb2.retrieve('password');
	assert.ok(results2.length > 0, 'should load from cache even without source');
	assert.deepStrictEqual(results1[0].source, results2[0].source, 'same results from cache');
});

// ── S3 URI source ──────────────────────────────────────────────────────────

test('S3 URI source throws InvalidSource with actionable message', async () => {
	const kb = new KnowledgeBase({ id: 'test' }, 's3kb', {
		source: 's3://my-docs-bucket/prefix/',
	});
	await assert.rejects(
		() => kb.retrieve('test'),
		(err: Error) => {
			assert.strictEqual(err.name, KnowledgeBaseErrors.InvalidSource);
			assert.ok(err.message.includes('S3 URI'), 'should mention S3 URI');
			assert.ok(err.message.includes('local folder path'), 'should suggest local folder');
			return true;
		},
	);
});

// ── Validation ─────────────────────────────────────────────────────────────

test('empty query throws ValidationError', async () => {
	const kb = new KnowledgeBase({ id: 'test' }, 'kb', { source: 'test-knowledge-tmp' });
	await assert.rejects(
		() => kb.retrieve(''),
		(err: Error) => err.name === KnowledgeBaseErrors.ValidationError,
	);
});

test('whitespace-only query throws ValidationError', async () => {
	const kb = new KnowledgeBase({ id: 'test' }, 'kb', { source: 'test-knowledge-tmp' });
	await assert.rejects(
		() => kb.retrieve('   '),
		(err: Error) => err.name === KnowledgeBaseErrors.ValidationError,
	);
});

// ── Unsupported file types ─────────────────────────────────────────────────

test('unsupported file types are skipped without error', async () => {
	// Add an unsupported binary file to the test knowledge dir
	writeFileSync(join(TEST_KNOWLEDGE, 'image.png'), Buffer.from([0x89, 0x50, 0x4E, 0x47]));
	writeFileSync(join(TEST_KNOWLEDGE, 'doc.pdf'), 'fake pdf content');

	const kb = new KnowledgeBase({ id: 'test' }, 'skip', { source: 'test-knowledge-tmp' });
	const results = await kb.retrieve('password');

	assert.ok(results.length > 0, 'should still return results from supported files');
	assert.ok(
		!results.some(r => r.source.endsWith('.png') || r.source.endsWith('.pdf')),
		'should not include unsupported file results',
	);
});

// ── Invalid source ─────────────────────────────────────────────────────────

test('missing source folder throws InvalidSource', async () => {
	const kb = new KnowledgeBase({ id: 'test' }, 'kb', { source: 'nonexistent-folder-xyz' });
	await assert.rejects(
		() => kb.retrieve('test'),
		(err: Error) => err.name === KnowledgeBaseErrors.InvalidSource,
	);
});

// ── fullId ─────────────────────────────────────────────────────────────────

test('fullId generation matches scope pattern', () => {
	const kb = new KnowledgeBase({ id: 'myapp' }, 'docs', { source: 'test-knowledge-tmp' });
	assert.strictEqual(kb.fullId, 'myapp-docs');
});

// ── Empty source folder ────────────────────────────────────────────────────

test('empty source folder returns empty results', async () => {
	const emptyDir = join(process.cwd(), 'test-empty-knowledge-tmp');
	if (existsSync(emptyDir)) rmSync(emptyDir, { recursive: true, force: true });
	mkdirSync(emptyDir, { recursive: true });

	try {
		const kb = new KnowledgeBase({ id: 'test' }, 'empty', { source: 'test-empty-knowledge-tmp' });
		const results = await kb.retrieve('anything');
		assert.strictEqual(results.length, 0);
	} finally {
		rmSync(emptyDir, { recursive: true, force: true });
	}
});

// ── Folder with only unsupported files ─────────────────────────────────────

test('folder with only unsupported files returns empty results', async () => {
	const unsupportedDir = join(process.cwd(), 'test-unsupported-knowledge-tmp');
	if (existsSync(unsupportedDir)) rmSync(unsupportedDir, { recursive: true, force: true });
	mkdirSync(unsupportedDir, { recursive: true });
	writeFileSync(join(unsupportedDir, 'image.png'), Buffer.from([0x89, 0x50, 0x4E, 0x47]));
	writeFileSync(join(unsupportedDir, 'data.bin'), Buffer.from([0x00, 0x01, 0x02]));
	writeFileSync(join(unsupportedDir, 'doc.pdf'), 'fake pdf');

	try {
		const kb = new KnowledgeBase({ id: 'test' }, 'unsup', { source: 'test-unsupported-knowledge-tmp' });
		const results = await kb.retrieve('anything');
		assert.strictEqual(results.length, 0);
	} finally {
		rmSync(unsupportedDir, { recursive: true, force: true });
	}
});

// ── Short paragraphs filtered ──────────────────────────────────────────────

test('short paragraphs under 20 chars are filtered out', async () => {
	const shortDir = join(process.cwd(), 'test-short-knowledge-tmp');
	if (existsSync(shortDir)) rmSync(shortDir, { recursive: true, force: true });
	mkdirSync(shortDir, { recursive: true });
	writeFileSync(join(shortDir, 'doc.md'), 'Short.\n\nAlso tiny.\n\nThis paragraph is definitely long enough to be included in the index results.');

	try {
		const kb = new KnowledgeBase({ id: 'test' }, 'short', { source: 'test-short-knowledge-tmp' });
		const results = await kb.retrieve('paragraph included index results');
		assert.ok(results.length > 0, 'should return the long paragraph');
		for (const r of results) {
			assert.ok(r.text.length >= 20, `chunk "${r.text}" should be >= 20 chars`);
		}
	} finally {
		rmSync(shortDir, { recursive: true, force: true });
	}
});

// ── Multiple metadata filters (AND semantics) ─────────────────────────────

test('multiple metadata filters use AND semantics', async () => {
	const kb = new KnowledgeBase({ id: 'test' }, 'andfilt', { source: 'test-knowledge-tmp' });
	const results = await kb.retrieve('password billing API token reset guide', {
		filter: {
			folder: { equals: 'faq' },
		},
	});

	for (const r of results) {
		assert.strictEqual(r.metadata.folder, 'faq');
	}

	const noResults = await kb.retrieve('password billing', {
		filter: {
			folder: { equals: 'faq' },
			nonexistent_key: { equals: 'nonexistent_value' },
		},
	});
	assert.strictEqual(noResults.length, 0, 'AND of impossible filter should return empty');
});

// ── maxResults upper bound clamped ─────────────────────────────────────────

test('maxResults clamped to maximum 100', async () => {
	const kb = new KnowledgeBase({ id: 'test' }, 'clamp', { source: 'test-knowledge-tmp' });
	const results = await kb.retrieve('the', { maxResults: 500 });
	assert.ok(results.length <= 100);
});

// ── Concurrent retrieve calls ──────────────────────────────────────────────

test('concurrent retrieve calls work correctly', async () => {
	const kb = new KnowledgeBase({ id: 'test' }, 'concurrent', { source: 'test-knowledge-tmp' });
	const [r1, r2, r3] = await Promise.all([
		kb.retrieve('password'),
		kb.retrieve('billing'),
		kb.retrieve('API'),
	]);
	assert.ok(r1.length > 0, 'password query should return results');
	assert.ok(r2.length > 0, 'billing query should return results');
	assert.ok(r3.length > 0, 'API query should return results');
});

// ── Cache corruption recovery ──────────────────────────────────────────────

test('rebuilds index when cache is corrupted', async () => {
	const kb = new KnowledgeBase({ id: 'test' }, 'corrupt-test', { source: 'test-knowledge-tmp' });
	await kb.retrieve('test query');

	const cachePath = join('.bb-data', 'test-corrupt-test', 'chunks.json');
	assert.ok(existsSync(cachePath), 'Cache file should exist');

	writeFileSync(cachePath, '{ INVALID JSON !!!');

	const kb2 = new KnowledgeBase({ id: 'test' }, 'corrupt-test', { source: 'test-knowledge-tmp' });
	const results = await kb2.retrieve('password');
	assert.ok(results.length > 0, 'Should recover from corrupt cache and return results');
});

// ── Customer-provided .metadata.json sidecar ───────────────────────────────

test('customer-provided metadata.json is used instead of auto-generated folder', async () => {
	const kb = new KnowledgeBase({ id: 'test' }, 'custmeta', { source: 'test-knowledge-tmp' });
	const results = await kb.retrieve('deploying applications production staging');

	const tutorialResult = results.find(r => r.source.includes('tutorials/'));
	assert.ok(tutorialResult, 'should have result from tutorials folder');
	assert.strictEqual(tutorialResult.metadata.category, 'deployment', 'should have customer category metadata');
	assert.strictEqual(tutorialResult.metadata.difficulty, 'intermediate', 'should have customer difficulty metadata');
	assert.strictEqual(tutorialResult.metadata.folder, undefined, 'should NOT have auto-generated folder metadata when customer sidecar exists');
});

test('filter by customer-provided metadata returns only matching docs', async () => {
	const kb = new KnowledgeBase({ id: 'test' }, 'custfilt', { source: 'test-knowledge-tmp' });
	const results = await kb.retrieve('password billing deployment guide', {
		filter: { category: { equals: 'deployment' } },
	});

	assert.ok(results.length > 0, 'should return results for category=deployment');
	for (const r of results) {
		assert.strictEqual(r.metadata.category, 'deployment', 'all results should have category=deployment');
	}
});

test('filter by customer-provided metadata with non-matching value returns empty', async () => {
	const kb = new KnowledgeBase({ id: 'test' }, 'custnomatch', { source: 'test-knowledge-tmp' });
	const results = await kb.retrieve('deployment guide', {
		filter: { category: { equals: 'nonexistent' } },
	});

	assert.strictEqual(results.length, 0, 'non-matching customer metadata filter should return empty');
});

test('auto-generated folder metadata still works for docs without sidecar', async () => {
	const kb = new KnowledgeBase({ id: 'test' }, 'autocoexist', { source: 'test-knowledge-tmp' });
	const results = await kb.retrieve('password reset billing', { maxResults: 20 });

	const faqResult = results.find(r => r.source.includes('faq/'));
	assert.ok(faqResult, 'should have result from faq folder');
	assert.strictEqual(faqResult.metadata.folder, 'faq', 'faq docs should still have auto-generated folder metadata');
	assert.strictEqual(faqResult.metadata.category, undefined, 'faq docs should NOT have customer category metadata');
});

test('metadata.json sidecar files are not indexed as documents', async () => {
	const kb = new KnowledgeBase({ id: 'test' }, 'nosidecaridx', { source: 'test-knowledge-tmp' });
	const results = await kb.retrieve('metadataAttributes stringValue type STRING', { maxResults: 50 });

	for (const r of results) {
		assert.ok(
			!r.source.endsWith('.metadata.json'),
			`should not index .metadata.json files as documents, but found: ${r.source}`,
		);
	}
});

// ── Cleanup after all tests ────────────────────────────────────────────────
test('cleanup', () => { cleanup(); });
