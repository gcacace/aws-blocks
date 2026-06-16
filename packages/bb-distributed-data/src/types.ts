// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Configuration options for the DistributedDatabase Building Block.
 */
import type { ChildLogger } from '@aws-blocks/bb-logger';
export interface DistributedDatabaseOptions {
  /** Path to directory containing numbered .sql migration files. */
  migrationsPath?: string;
  /**
   * CloudFormation removal policy.
   * @default 'retain'
   */
  removalPolicy?: 'destroy' | 'retain';
	/** Optional logger for internal operations. When omitted, a default Logger at error level is created. */
	logger?: ChildLogger;
}

/**
 * Options for transaction execution.
 */
export interface TransactionOptions {
  /**
   * Automatically retry the transaction on OCC conflict (error 40001).
   * ⚠️ Callback may execute multiple times. Do NOT include external side effects.
   * @default false
   */
  retryOnConflict?: boolean;
  /**
   * Maximum retry attempts on OCC conflict. Only applies when retryOnConflict is true.
   * @default 3
   */
  maxRetries?: number;
}
