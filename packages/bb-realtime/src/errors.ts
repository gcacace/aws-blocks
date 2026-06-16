// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Typed error constants for Realtime. Use with `isBlocksError()` in catch blocks.
 *
 * @example
 * ```typescript
 * try {
 *   await rt.publish('chat', 'room-1', data);
 * } catch (e: unknown) {
 *   if (isBlocksError(e, RealtimeErrors.ValidationFailed)) {
 *     // data failed schema validation
 *   }
 *   throw e;
 * }
 * ```
 */
export const RealtimeErrors = {
	PublishFailed: 'PublishFailedException',
	ValidationFailed: 'ValidationFailedException',
	ConnectionFailed: 'ConnectionFailedException',
} as const;
