// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * In-process OpenTelemetry SDK bootstrap shared by the OTel building blocks.
 *
 * There is no exec-wrapper layer, so the blocks register the global OTel providers
 * themselves at cold start. In AWS the exporters target the standalone collector on
 * `localhost:4318`; the mock runtime swaps in console/file exporters. Either way the
 * SDK + escape-hatch handles behave identically.
 *
 * **Force-flush is mandatory.** Lambda freezes the sandbox after the handler returns,
 * which would drop the SDK's async exports. Call {@link flushOtel} before returning
 * (the OTel blocks register it into the shared handler's completion hook).
 */

import { trace, metrics, context, propagation } from '@opentelemetry/api';
import { logs } from '@opentelemetry/api-logs';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { BasicTracerProvider, BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import type { SpanExporter } from '@opentelemetry/sdk-trace-base';
import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import type { PushMetricExporter } from '@opentelemetry/sdk-metrics';
import { LoggerProvider, BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import type { LogRecordExporter } from '@opentelemetry/sdk-logs';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import type { OtelSdkOptions } from './types.js';

const DEFAULT_COLLECTOR_URL = 'http://localhost:4318';
const SDK_KEY = '__BLOCKS_OTEL_SDK__';
const FLUSH_KEY = '__BLOCKS_OTEL_FLUSHERS__';

/** Factory hooks so the mock runtime can substitute exporters without re-wiring providers. */
export interface OtelExporters {
	traceExporter(): SpanExporter;
	metricExporter(): PushMetricExporter;
	logExporter(): LogRecordExporter;
}

/** The initialized in-process OTel providers, returned by {@link getOrCreateOtelSdk}. */
export interface OtelSdk {
	tracerProvider: BasicTracerProvider;
	meterProvider: MeterProvider;
	loggerProvider: LoggerProvider;
}

/** Default exporters: OTLP/HTTP to the local collector. */
function defaultExporters(collectorUrl: string): OtelExporters {
	return {
		traceExporter: () => new OTLPTraceExporter({ url: `${collectorUrl}/v1/traces` }),
		metricExporter: () => new OTLPMetricExporter({ url: `${collectorUrl}/v1/metrics` }),
		logExporter: () => new OTLPLogExporter({ url: `${collectorUrl}/v1/logs` }),
	};
}

/**
 * Initialize the global OTel providers exactly once per process, returning the
 * existing instance on subsequent calls.
 *
 * @param options - service name + optional collector URL.
 * @param exporters - exporter factory override (used by the mock runtime).
 */
export function getOrCreateOtelSdk(options: OtelSdkOptions, exporters?: OtelExporters): OtelSdk {
	const g = globalThis as any;
	if (g[SDK_KEY]) return g[SDK_KEY] as OtelSdk;

	const collectorUrl = options.collectorUrl ?? DEFAULT_COLLECTOR_URL;
	const exp = exporters ?? defaultExporters(collectorUrl);
	const resource = resourceFromAttributes({ 'service.name': options.serviceName });

	// Register a context manager + W3C propagator so active-span reads
	// (trace.getActiveSpan, propagation.inject/extract) work. BasicTracerProvider
	// alone does not install these.
	context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
	propagation.setGlobalPropagator(new W3CTraceContextPropagator());

	const spanProcessor = new BatchSpanProcessor(exp.traceExporter());
	const tracerProvider = new BasicTracerProvider({ resource, spanProcessors: [spanProcessor] });
	trace.setGlobalTracerProvider(tracerProvider);

	const metricReader = new PeriodicExportingMetricReader({
		exporter: exp.metricExporter(),
		exportIntervalMillis: 60_000,
	});
	const meterProvider = new MeterProvider({ resource, readers: [metricReader] });
	metrics.setGlobalMeterProvider(meterProvider);

	const logProcessor = new BatchLogRecordProcessor(exp.logExporter());
	const loggerProvider = new LoggerProvider({ resource, processors: [logProcessor] });
	logs.setGlobalLoggerProvider(loggerProvider);

	const sdk: OtelSdk = { tracerProvider, meterProvider, loggerProvider };
	g[SDK_KEY] = sdk;

	// Register a flusher so the shared handler can drain all signals before the
	// sandbox freeze. Stored on a process-global list so multiple blocks share one.
	registerOtelFlusher(async () => {
		await Promise.all([
			tracerProvider.forceFlush(),
			meterProvider.forceFlush(),
			loggerProvider.forceFlush(),
		]);
	});

	return sdk;
}

/**
 * Well-known global the runtime handler calls after each invocation to flush OTel.
 * Published here (rather than imported by core) so `@aws-blocks/core` stays decoupled
 * from the OTel packages — core only calls it when an OTel block has initialized.
 */
const FLUSH_FN_KEY = '__BLOCKS_OTEL_FLUSH__';

/** Register a flush callback invoked by {@link flushOtel}. Idempotent per callback identity. */
export function registerOtelFlusher(fn: () => Promise<void>): void {
	const g = globalThis as any;
	if (!g[FLUSH_KEY]) g[FLUSH_KEY] = new Set<() => Promise<void>>();
	(g[FLUSH_KEY] as Set<() => Promise<void>>).add(fn);
	// Publish flushOtel on the well-known global so the runtime handler can drain
	// telemetry before the sandbox freezes, without importing this package.
	if (!g[FLUSH_FN_KEY]) g[FLUSH_FN_KEY] = flushOtel;
}

/**
 * Force-flush every registered OTel provider. Call before the handler returns.
 * Safe to call when no SDK is initialized (no-op). Never throws — flush failures
 * are observability data loss, not request failures.
 */
export async function flushOtel(): Promise<void> {
	const g = globalThis as any;
	const flushers = g[FLUSH_KEY] as Set<() => Promise<void>> | undefined;
	if (!flushers || flushers.size === 0) return;
	const results = await Promise.allSettled(Array.from(flushers).map(fn => fn()));
	// Swallow individual flush errors; telemetry loss must not fail the request.
	void results;
}
