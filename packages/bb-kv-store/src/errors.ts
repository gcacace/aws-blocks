// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Typed error constants for KVStore. Use with `isBlocksError()` in catch blocks.
 *
 * Error names match the underlying DynamoDB error names so customers familiar
 * with AWS encounter familiar strings.
 *
 * @example
 * ```typescript
 * try {
 *   await store.put('key', value, { ifNotExists: true });
 * } catch (e: unknown) {
 *   if (isBlocksError(e, KVStoreErrors.ConditionalCheckFailed)) {
 *     // key already exists
 *   }
 *   throw e;
 * }
 * ```
 */
export const KVStoreErrors = {
	ConditionalCheckFailed: 'ConditionalCheckFailedException',
	ValidationFailed: 'ValidationFailedException',
	/**
	 * The item exceeds DynamoDB's 400 KB per-item size limit. Catchable via
	 * `isBlocksError(e, KVStoreErrors.ItemTooLarge)`.
	 *
	 * In the AWS layer, DynamoDB raises a generic `ValidationException` for
	 * many conditions. KVStore inspects the error message for size-specific
	 * text (e.g. "size has exceeded") before mapping it to this error. Other
	 * `ValidationException` causes (malformed expressions, type mismatches,
	 * reserved-word conflicts) propagate as-is.
	 *
	 * In the mock layer, a client-side byte-length check produces this error
	 * deterministically before any I/O.
	 */
	ItemTooLarge: 'ItemTooLargeException',
} as const;
