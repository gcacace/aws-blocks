// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Typed error constants for Logger. Used internally as markers in degraded
 * log entries when context serialization fails. Not thrown to consumers —
 * logging should never throw.
 *
 * @example
 * ```typescript
 * // In a degraded log entry, you'll see:
 * // { "_serializationError": "SerializationFailedException", ... }
 * ```
 */
export const LoggingErrors = {
	/** Marker in degraded log entries when context serialization fails. */
	SerializationFailed: 'SerializationFailedException',
} as const;
