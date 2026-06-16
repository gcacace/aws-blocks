// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import type { SqlQuery } from './sql.js';

/**
 * Transaction handle passed to the `transaction()` callback.
 * Provides the same query methods as a database, scoped to the transaction.
 */
export interface Transaction {
  /** Execute a query within this transaction and return all matching rows. */
  query<T>(query: SqlQuery): Promise<T[]>;
  /** Execute a query within this transaction and return the first row or null. */
  queryOne<T>(query: SqlQuery): Promise<T | null>;
  /** Execute a mutation within this transaction and return affected row count. */
  execute(query: SqlQuery): Promise<{ rowCount: number }>;
}
