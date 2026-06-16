// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { ChildLogger } from '@aws-blocks/bb-logger';

/**
 * Context passed to the AsyncJob handler with metadata about the current job.
 */
export interface AsyncJobContext {
	/** Unique identifier for this job (SQS message ID in AWS, truncated UUID in mock). */
	jobId: string;
	/** Number of times this message has been received (1 on first delivery). */
	receiveCount: number;
	/** ISO 8601 timestamp of when the message was sent. */
	sentAt: string;
}

/**
 * Configuration options for creating an AsyncJob.
 */
export interface AsyncJobOptions<T> {
	/** Async function that processes each job payload. */
	handler: (payload: T, context: AsyncJobContext) => Promise<void>;
	/** Optional schema for runtime payload validation on submit. Accepts any StandardSchemaV1 implementation (Zod, Valibot, ArkType, etc.). */
	schema?: StandardSchemaV1<T>;
	/** Maximum retry attempts before sending to the DLQ. Default: 3. */
	maxRetries?: number;
	/** Number of messages the Lambda trigger receives per invocation. Default: 1. */
	batchSize?: number;
	/** Optional logger for internal operations. When omitted, a default Logger at error level is created. */
	logger?: ChildLogger;
}

/**
 * Options for submit() and submitBatch() calls.
 */
export interface SubmitOptions {
	/** Delay before the job becomes visible for processing. 0–900 seconds. Default: 0. */
	delaySeconds?: number;
}

/**
 * Result from submitBatch() including successful job IDs and any failures.
 */
export interface BatchSubmitResult {
	/** Job IDs in the same order as input payloads. `null` for entries that failed. */
	jobIds: Array<string | null>;
	/** Details of any entries that failed to enqueue. */
	failed: Array<{ index: number; code: string; message: string }>;
}

