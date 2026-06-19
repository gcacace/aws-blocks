// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { Scope } from '@aws-blocks/core';
import type { ScopeParent } from '@aws-blocks/core';
import { metrics as otelMetrics } from '@opentelemetry/api';
import type { Counter, Histogram, UpDownCounter, ObservableGauge, Meter, MetricOptions } from '@opentelemetry/api';
import { getOrCreateOtelSdk } from '@aws-blocks/otel-common';
import { Logger } from '@aws-blocks/bb-logger';
import type { ChildLogger } from '@aws-blocks/bb-logger';
import type { EmitOptions, MetricDatum, MetricUnit, OtelMetricsOptions, OtelMetricsEmitter } from './types.js';
import { OtelMetricsErrors } from './errors.js';

export { OtelMetricsErrors } from './errors.js';
export type {
	OtelMetricsOptions,
	EmitOptions,
	MetricDatum,
	MetricUnit,
	OtelMetricsEmitter,
	Counter,
	Histogram,
	UpDownCounter,
	ObservableGauge,
	Meter,
} from './types.js';

function blocksError(name: string, message: string): Error {
	const err = new Error(`${name}: ${message}`);
	err.name = name;
	return err;
}

function validateMetricName(name: string): void {
	if (!name || name.length === 0) {
		throw blocksError(OtelMetricsErrors.InvalidMetricName, 'Metric name must not be empty');
	}
	if (name.length > 255) {
		throw blocksError(OtelMetricsErrors.InvalidMetricName, `Metric name exceeds 255 characters (got ${name.length})`);
	}
}

/** Normalize a user-facing unit to its OTel/UCUM form. */
function toOtelUnit(unit?: MetricUnit): string {
	switch (unit) {
		case undefined:
		case 'None':
		case 'Count':
		case '1':
			return '1';
		case 'Seconds':
			return 's';
		case 'Milliseconds':
			return 'ms';
		case 'Microseconds':
			return 'us';
		case 'Bytes':
			return 'By';
		case 'Percent':
			return '%';
		default:
			return unit;
	}
}

/**
 * Custom application metrics via OpenTelemetry, exported to Amazon CloudWatch's OTLP
 * endpoint (PromQL-queryable) through the in-process OTel SDK + collector layer.
 *
 * Keeps the ergonomic `emit`/`emitBatch`/`child` surface of the EMF-based `Metrics`
 * block, and additionally exposes OTel's typed instruments (`counter`, `histogram`,
 * `upDownCounter`, `observableGauge`) and the raw `Meter` (`rawMeter`) for full power.
 *
 * **When to use:** vendor-neutral OTel metrics, or when you want OTel's instrument
 * semantics (monotonic counters, histograms, async gauges). For the AWS-native EMF
 * path, use `Metrics`.
 */
export class OtelMetrics extends Scope implements OtelMetricsEmitter {
	/** Instrumentation scope name; surfaced to the Dashboard as the metric namespace. */
	readonly namespace: string;
	/**
	 * Default attributes applied to every metric. Exposed as `defaultDimensions` for
	 * structural compatibility with the Dashboard's `MetricsBBRef`.
	 */
	readonly defaultDimensions: Readonly<Record<string, string>>;
	/** Marks these metrics as OTLP/PromQL so the Dashboard renders PromQL widgets. */
	readonly metricsKind = 'otlp' as const;

	/** @internal */
	protected log: ChildLogger;
	private meter: Meter;
	private counters = new Map<string, Counter>();

	constructor(scope: ScopeParent, id: string, options?: OtelMetricsOptions) {
		super(id, { parent: scope });
		this.log = options?.logger ?? new Logger(this, 'logger', { level: 'error' });
		this.namespace = options?.namespace ?? this.fullId;
		this.defaultDimensions = options?.defaultAttributes ?? {};
		getOrCreateOtelSdk({ serviceName: this.namespace });
		this.meter = otelMetrics.getMeter(this.namespace);
	}

	private counterFor(name: string, unit?: MetricUnit): Counter {
		let c = this.counters.get(name);
		if (!c) {
			c = this.meter.createCounter(name, { unit: toOtelUnit(unit) });
			this.counters.set(name, c);
		}
		return c;
	}

	/** Record a single additive metric data point (mapped onto an OTel Counter). */
	emit(name: string, value: number, options?: EmitOptions): void {
		validateMetricName(name);
		this.counterFor(name, options?.unit).add(value, { ...this.defaultDimensions, ...options?.attributes });
	}

	/** Record multiple data points (max 100). */
	emitBatch(metrics: MetricDatum[]): void {
		if (metrics.length > 100) {
			throw blocksError(OtelMetricsErrors.BatchTooLarge, `Batch exceeds 100 metrics (got ${metrics.length})`);
		}
		for (const m of metrics) {
			validateMetricName(m.name);
			this.counterFor(m.name, m.unit).add(m.value, { ...this.defaultDimensions, ...m.attributes });
		}
	}

	/** No-op: the in-process SDK exports on its own cadence and is force-flushed by the runtime. */
	flush(): void {}

	/** Create a child emitter with merged default attributes (same namespace/meter). */
	child(attributes: Record<string, string>): OtelMetricsEmitter {
		return new ChildOtelMetrics(this.meter, this.counters, { ...this.defaultDimensions, ...attributes });
	}

	// ── Typed OTel instruments (escape hatch with structure) ──

	/** Create (or get) a monotonic Counter. */
	counter(name: string, options?: MetricOptions): Counter {
		return this.meter.createCounter(name, options);
	}

	/** Create a Histogram for value distributions. */
	histogram(name: string, options?: MetricOptions): Histogram {
		return this.meter.createHistogram(name, options);
	}

	/** Create a non-monotonic UpDownCounter. */
	upDownCounter(name: string, options?: MetricOptions): UpDownCounter {
		return this.meter.createUpDownCounter(name, options);
	}

	/** Create an async ObservableGauge driven by a callback. */
	observableGauge(name: string, callback: (result: { observe(value: number, attributes?: Record<string, string>): void }) => void, options?: MetricOptions): ObservableGauge {
		const gauge = this.meter.createObservableGauge(name, options);
		gauge.addCallback(callback as any);
		return gauge;
	}

	/** The underlying OTel `Meter` — full escape hatch. */
	get rawMeter(): Meter {
		return this.meter;
	}
}

// ── ChildOtelMetrics ──────────────────────────────────────────────────────────

class ChildOtelMetrics implements OtelMetricsEmitter {
	constructor(
		private meter: Meter,
		private counters: Map<string, Counter>,
		readonly defaultDimensions: Readonly<Record<string, string>>,
	) {}

	private counterFor(name: string, unit?: MetricUnit): Counter {
		let c = this.counters.get(name);
		if (!c) {
			c = this.meter.createCounter(name, { unit: toOtelUnit(unit) });
			this.counters.set(name, c);
		}
		return c;
	}

	emit(name: string, value: number, options?: EmitOptions): void {
		validateMetricName(name);
		this.counterFor(name, options?.unit).add(value, { ...this.defaultDimensions, ...options?.attributes });
	}

	emitBatch(metrics: MetricDatum[]): void {
		if (metrics.length > 100) {
			throw blocksError(OtelMetricsErrors.BatchTooLarge, `Batch exceeds 100 metrics (got ${metrics.length})`);
		}
		for (const m of metrics) {
			validateMetricName(m.name);
			this.counterFor(m.name, m.unit).add(m.value, { ...this.defaultDimensions, ...m.attributes });
		}
	}

	flush(): void {}

	child(attributes: Record<string, string>): OtelMetricsEmitter {
		return new ChildOtelMetrics(this.meter, this.counters, { ...this.defaultDimensions, ...attributes });
	}
}
