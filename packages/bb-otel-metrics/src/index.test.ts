// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert';
import { OtelMetrics, OtelMetricsErrors } from './index.aws.js';

const fakeScope = { id: 'root' } as any;

afterEach(() => {
	delete (globalThis as any).__BLOCKS_OTEL_SDK__;
	delete (globalThis as any).__BLOCKS_OTEL_FLUSHERS__;
});

describe('OtelMetrics — scope + namespace', () => {
	test('extends Scope (id, parent, fullId)', () => {
		const m = new OtelMetrics(fakeScope, 'metrics');
		assert.strictEqual(m.id, 'metrics');
		assert.strictEqual(m.parent, fakeScope);
		assert.strictEqual(m.fullId, 'root-metrics');
	});

	test('namespace defaults to fullId, override respected', () => {
		assert.strictEqual(new OtelMetrics(fakeScope, 'm').namespace, 'root-m');
		assert.strictEqual(new OtelMetrics(fakeScope, 'm2', { namespace: 'MyApp/Orders' }).namespace, 'MyApp/Orders');
	});

	test('defaultDimensions exposed for Dashboard MetricsBBRef compat', () => {
		const m = new OtelMetrics(fakeScope, 'm', { defaultAttributes: { service: 'orders' } });
		assert.deepStrictEqual(m.defaultDimensions, { service: 'orders' });
	});
});

describe('OtelMetrics — ergonomic emission', () => {
	test('emit / emitBatch / flush / child do not throw', () => {
		const m = new OtelMetrics(fakeScope, 'm', { defaultAttributes: { env: 'test' } });
		assert.doesNotThrow(() => m.emit('RequestCount', 1, { unit: 'Count' }));
		assert.doesNotThrow(() => m.emit('Latency', 42, { unit: 'Milliseconds', attributes: { route: '/a' } }));
		assert.doesNotThrow(() => m.emitBatch([
			{ name: 'A', value: 1 },
			{ name: 'B', value: 2, unit: 'Bytes' },
		]));
		assert.doesNotThrow(() => m.flush());
		const child = m.child({ component: 'db' });
		assert.doesNotThrow(() => child.emit('Queries', 3));
	});

	test('child returns an emitter (not an OtelMetrics) with merged dimensions', () => {
		const m = new OtelMetrics(fakeScope, 'm', { defaultAttributes: { a: '1' } });
		const child = m.child({ b: '2' });
		assert.ok(typeof child.emit === 'function');
		assert.ok(!(child instanceof OtelMetrics));
		assert.deepStrictEqual((child as any).defaultDimensions, { a: '1', b: '2' });
	});
});

describe('OtelMetrics — validation', () => {
	test('rejects empty metric name', () => {
		const m = new OtelMetrics(fakeScope, 'm');
		assert.throws(() => m.emit('', 1), (e: Error) => e.name === OtelMetricsErrors.InvalidMetricName);
	});

	test('rejects metric name > 255 chars', () => {
		const m = new OtelMetrics(fakeScope, 'm');
		assert.throws(() => m.emit('x'.repeat(256), 1), (e: Error) => e.name === OtelMetricsErrors.InvalidMetricName);
	});

	test('rejects batch > 100', () => {
		const m = new OtelMetrics(fakeScope, 'm');
		const batch = Array.from({ length: 101 }, (_, i) => ({ name: `M${i}`, value: i }));
		assert.throws(() => m.emitBatch(batch), (e: Error) => e.name === OtelMetricsErrors.BatchTooLarge);
	});

	test('batch of exactly 100 is accepted', () => {
		const m = new OtelMetrics(fakeScope, 'm');
		const batch = Array.from({ length: 100 }, (_, i) => ({ name: `M${i}`, value: i }));
		assert.doesNotThrow(() => m.emitBatch(batch));
	});
});

describe('OtelMetrics — typed instruments + escape hatch', () => {
	test('counter/histogram/upDownCounter/observableGauge return usable handles', () => {
		const m = new OtelMetrics(fakeScope, 'm');
		assert.ok(typeof m.counter('c').add === 'function');
		assert.ok(typeof m.histogram('h').record === 'function');
		assert.ok(typeof m.upDownCounter('u').add === 'function');
		assert.doesNotThrow(() => m.observableGauge('g', (r) => r.observe(1)));
	});

	test('rawMeter exposes the OTel Meter', () => {
		const m = new OtelMetrics(fakeScope, 'm');
		assert.ok(typeof m.rawMeter.createCounter === 'function');
	});

	test('registers an OTel flusher on construction', () => {
		new OtelMetrics(fakeScope, 'm');
		const flushers = (globalThis as any).__BLOCKS_OTEL_FLUSHERS__ as Set<unknown> | undefined;
		assert.ok(flushers && flushers.size >= 1);
	});
});
