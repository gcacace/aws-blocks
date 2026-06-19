// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert';
import { trace, metrics } from '@opentelemetry/api';
import { logs } from '@opentelemetry/api-logs';
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace-base';
import { InMemoryMetricExporter, AggregationTemporality } from '@opentelemetry/sdk-metrics';
import { InMemoryLogRecordExporter } from '@opentelemetry/sdk-logs';
import { getOrCreateOtelSdk, registerOtelFlusher, flushOtel } from './sdk.js';
import type { OtelExporters } from './sdk.js';

function inMemoryExporters(): OtelExporters {
	return {
		traceExporter: () => new InMemorySpanExporter(),
		metricExporter: () => new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE),
		logExporter: () => new InMemoryLogRecordExporter(),
	};
}

afterEach(() => {
	// Reset process-global SDK + flushers between tests.
	delete (globalThis as any).__BLOCKS_OTEL_SDK__;
	delete (globalThis as any).__BLOCKS_OTEL_FLUSHERS__;
});

describe('getOrCreateOtelSdk', () => {
	test('wires up a real (non-noop) tracer — spans get valid, non-zero contexts', () => {
		// trace.getTracerProvider() returns a delegating ProxyTracerProvider by design,
		// so we assert on behavior: a real registered provider yields valid 32-hex trace
		// IDs, whereas the unconfigured no-op tracer yields an all-zero invalid context.
		getOrCreateOtelSdk({ serviceName: 'test-svc' }, inMemoryExporters());
		const span = trace.getTracer('test').startSpan('probe');
		const ctx = span.spanContext();
		span.end();
		assert.match(ctx.traceId, /^[0-9a-f]{32}$/);
		assert.notStrictEqual(ctx.traceId, '0'.repeat(32));
	});

	test('registers non-noop meter and logger providers', () => {
		getOrCreateOtelSdk({ serviceName: 'test-svc' }, inMemoryExporters());
		const meterName = (metrics.getMeterProvider() as any)?.constructor?.name ?? '';
		const loggerName = (logs.getLoggerProvider() as any)?.constructor?.name ?? '';
		assert.doesNotMatch(meterName, /noop/i, `meter provider was ${meterName}`);
		assert.doesNotMatch(loggerName, /noop/i, `logger provider was ${loggerName}`);
	});

	test('is a singleton — repeated calls return the same instance', () => {
		const a = getOrCreateOtelSdk({ serviceName: 'test-svc' }, inMemoryExporters());
		const b = getOrCreateOtelSdk({ serviceName: 'other-svc' }, inMemoryExporters());
		assert.strictEqual(a, b);
	});

	test('produces a usable tracer that emits a real span context', () => {
		getOrCreateOtelSdk({ serviceName: 'test-svc' }, inMemoryExporters());
		const tracer = trace.getTracer('test');
		const span = tracer.startSpan('unit');
		const ctx = span.spanContext();
		span.end();
		assert.match(ctx.traceId, /^[0-9a-f]{32}$/);
	});
});

describe('flushOtel', () => {
	test('is a safe no-op when no SDK is initialized', async () => {
		await assert.doesNotReject(flushOtel());
	});

	test('invokes every registered flusher', async () => {
		let calls = 0;
		registerOtelFlusher(async () => { calls++; });
		registerOtelFlusher(async () => { calls++; });
		await flushOtel();
		assert.strictEqual(calls, 2);
	});

	test('does not throw when a flusher rejects (telemetry loss must not fail the request)', async () => {
		registerOtelFlusher(async () => { throw new Error('export failed'); });
		await assert.doesNotReject(flushOtel());
	});

	test('getOrCreateOtelSdk auto-registers a flusher', async () => {
		getOrCreateOtelSdk({ serviceName: 'test-svc' }, inMemoryExporters());
		const flushers = (globalThis as any).__BLOCKS_OTEL_FLUSHERS__ as Set<unknown>;
		assert.ok(flushers && flushers.size >= 1);
		await assert.doesNotReject(flushOtel());
	});
});
