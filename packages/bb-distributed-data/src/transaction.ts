// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Shared OCC retry logic for DistributedDatabase.transaction().
 */

import type { DatabaseBase } from '@aws-blocks/data-common';
import type { Transaction } from '@aws-blocks/data-common';
import { DistributedDatabaseErrors, PG_SERIALIZATION_FAILURE } from './errors.js';
import type { TransactionOptions } from './types.js';
import { DEFAULT_MAX_RETRIES } from './constants.js';

/**
 * Execute a transaction with optional OCC retry.
 * Retries on serialization failure (error 40001) up to maxRetries times.
 */
export async function transactionWithRetry<T>(
  base: DatabaseBase,
  fn: (tx: Transaction) => Promise<T>,
  options?: TransactionOptions,
): Promise<T> {
  const maxAttempts = options?.retryOnConflict ? (options.maxRetries ?? DEFAULT_MAX_RETRIES) + 1 : 1;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await base.transaction(fn);
    } catch (e) {
      const isOcc = e instanceof Error &&
        ((e as any).code === PG_SERIALIZATION_FAILURE || e.name === DistributedDatabaseErrors.SerializationFailure);
      if (isOcc && attempt < maxAttempts) continue;
      throw e;
    }
  }
  throw new Error('Transaction failed: max retries exceeded');
}
