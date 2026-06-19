// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Shared types for the OTel Logger building block. Zero runtime dependencies
 * beyond a type-only import from `@opentelemetry/api-logs`.
 *
 * `OtelLogger` keeps the `debug/info/warn/error` + `child` ergonomics of the
 * stdout-based `Logger` block while emitting OpenTelemetry `LogRecord`s through the
 * in-process OTel SDK (see `@aws-blocks/otel-common`) to the collector layer.
 */
import type { Logger as OtelApiLogger } from '@opentelemetry/api-logs';

/** Log severity levels, mapped to OTel `SeverityNumber`s. */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** Configuration for the OTel Logger building block. */
export interface OtelLoggingOptions {
	/** Minimum level. Messages below this are dropped. Default: `'info'` (or `LOG_LEVEL` env). */
	level?: LogLevel;
	/** Attributes included on every log record from this logger. */
	defaultContext?: Record<string, unknown>;
}

/**
 * A child logger instance returned by `OtelLogger.child()`. Same logging surface
 * as the root block but not a Scope node.
 */
export interface OtelChildLogger {
	debug(message: string, context?: Record<string, unknown>): void;
	info(message: string, context?: Record<string, unknown>): void;
	warn(message: string, context?: Record<string, unknown>): void;
	error(message: string, context?: Record<string, unknown>): void;
	child(context: Record<string, unknown>): OtelChildLogger;
}

// Re-export the OTel Logs API handle type for the escape-hatch surface.
export type { Logger as OtelApiLogger } from '@opentelemetry/api-logs';
