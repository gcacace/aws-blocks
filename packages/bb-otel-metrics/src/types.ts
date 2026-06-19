// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Shared types for the OTel Metrics building block. Zero runtime dependencies
 * beyond type-only imports from `@opentelemetry/api`.
 *
 * `OtelMetrics` keeps the ergonomic `emit`/`emitBatch`/`child` surface of the
 * EMF-based `Metrics` block (so it's drop-in familiar) while exposing OpenTelemetry's
 * typed instruments and the raw `Meter` as an escape hatch. Telemetry is exported
 * via the in-process OTel SDK (see `@aws-blocks/otel-common`) to the collector layer.
 */
import type { Counter, Histogram, UpDownCounter, ObservableGauge, Meter } from '@opentelemetry/api';
import type { ChildLogger } from '@aws-blocks/bb-logger';

/**
 * Unit of a metric value. A superset-compatible subset of OTel/UCUM units; passed
 * straight through to the OTel instrument's `unit`. Use `'1'` (dimensionless) or
 * `'None'` when no unit applies.
 */
export type MetricUnit =
	| 'Count'
	| '1'
	| 'Seconds'
	| 's'
	| 'Milliseconds'
	| 'ms'
	| 'Microseconds'
	| 'Bytes'
	| 'By'
	| 'Percent'
	| '%'
	| 'None';

/** Options for a single `emit`. */
export interface EmitOptions {
	/** Unit of the metric value. Defaults to `'1'`. */
	unit?: MetricUnit;
	/** Attributes (dimensions) for this data point. Merged over `defaultAttributes`. */
	attributes?: Record<string, string>;
}

/** A single metric data point for `emitBatch`. */
export interface MetricDatum {
	/** Metric name (non-empty). */
	name: string;
	/** Numeric value. */
	value: number;
	/** Unit of the metric value. Defaults to `'1'`. */
	unit?: MetricUnit;
	/** Attributes (dimensions). Merged over `defaultAttributes`. */
	attributes?: Record<string, string>;
}

/** Configuration for the OTel Metrics building block. */
export interface OtelMetricsOptions {
	/**
	 * Instrumentation scope name (used as the OTel Meter name and as the metric
	 * namespace surfaced to the Dashboard). Defaults to the scope's `fullId`.
	 */
	namespace?: string;
	/** Attributes (dimensions) applied to every metric. Per-emit attributes win on conflict. */
	defaultAttributes?: Record<string, string>;
	/** Optional logger for internal operations. Defaults to an error-level Logger. */
	logger?: ChildLogger;
}

/**
 * A child metrics emitter with inherited namespace and merged default attributes.
 * Provides the ergonomic emission surface but is not a Scope node.
 */
export interface OtelMetricsEmitter {
	emit(name: string, value: number, options?: EmitOptions): void;
	emitBatch(metrics: MetricDatum[]): void;
	flush(): void;
	child(attributes: Record<string, string>): OtelMetricsEmitter;
}

// Re-export the OTel instrument handle types for the escape-hatch API surface.
export type { Counter, Histogram, UpDownCounter, ObservableGauge, Meter } from '@opentelemetry/api';
