// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Shared types for KVStore. Imported by mock, aws, cdk, and browser entry points.
 * This file has zero runtime dependencies — types only.
 */
import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { ChildLogger } from '@aws-blocks/bb-logger';

export interface ConditionalWriteOptions<T = unknown> {
	/** Only write if the key does not already exist. */
	ifNotExists?: boolean;
	/** Only write if the current value deep-equals this value (optimistic locking / compare-and-swap). */
	ifValueEquals?: T;
}

export interface ConditionalDeleteOptions<T = unknown> {
	/** Only delete if the key exists. Throws ConditionalCheckFailedException otherwise. */
	ifExists?: boolean;
	/** Only delete if the current value deep-equals this value (optimistic locking). */
	ifValueEquals?: T;
}

export interface KVStoreOptions<T = string> {
	/** Runtime schema for value validation on `put`. Accepts any StandardSchemaV1 implementation (Zod, Valibot, ArkType, etc.). When provided, the type parameter `T` is inferred from the schema. */
	schema?: StandardSchemaV1<T>;
	/** Wrap an existing DynamoDB table instead of creating one. */
	table?: ExternalTableRef;
	/**
	 * Optional logger for internal KVStore operations. Accepts a `Logger`
	 * instance or any `ChildLogger` from `@aws-blocks/bb-logger`.
	 *
	 * When omitted, a default Logger at error level is created (silent during
	 * normal operation, only emits on errors).
	 *
	 * @example
	 * ```typescript
	 * import { Logger } from '@aws-blocks/bb-logger';
	 * const log = new Logger(scope, 'app', { level: 'debug' });
	 * const store = new KVStore(scope, 'cache', { logger: log });
	 * ```
	 */
	logger?: ChildLogger;
	/**
	 * CDK removal behavior for the underlying DynamoDB table. When omitted,
	 * CDK's default applies (RETAIN — data is preserved on `cdk destroy`).
	 * Pass `'destroy'` for sandbox / ephemeral stacks where the table and
	 * its contents should be dropped on teardown. Pass `'retain'` to set
	 * the policy explicitly (identical to omitting it today, but robust
	 * against stack-layer policy overrides).
	 *
	 * Templates that apply `RemovalPolicies.of(stack).destroy()` at the
	 * top level (e.g. under `sandboxMode`) override this setting.
	 *
	 * Ignored by the mock and browser runtimes (no AWS resource to retain).
	 */
	removalPolicy?: 'destroy' | 'retain';
}

export interface ExternalTableRef {
	readonly __brand: 'ExternalTableRef';
	readonly tableName: string;
}
