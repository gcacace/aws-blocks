// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Typed error constants for FileBucket. Use with `isBlocksError()` in catch blocks.
 *
 * @example
 * ```typescript
 * try {
 *   const file = await bucket.get('missing.txt');
 * } catch (e: unknown) {
 *   if (isBlocksError(e, FileBucketErrors.FileNotFound)) {
 *     // file does not exist
 *   }
 *   throw e;
 * }
 * ```
 */
export const FileBucketErrors = {
	FileNotFound: 'NoSuchKey',
	FileTooLarge: 'EntityTooLarge',
} as const;
