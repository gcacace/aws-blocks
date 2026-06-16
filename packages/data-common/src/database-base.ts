// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import type { DatabaseEngine, TransactionHandle } from './engine.js';
import type { Transaction } from './types.js';
import type { SqlQuery } from './sql.js';
import { unwrapQuery } from './sql.js';

/**
 * Transaction implementation that routes calls through a DatabaseEngine
 * using an opaque TransactionHandle.
 *
 * Created by {@link DatabaseBase.transaction} and passed to the user's callback.
 * All operations execute within the scope of the underlying engine transaction.
 */
class TransactionImpl implements Transaction {
  constructor(
    private engine: DatabaseEngine,
    private handle: TransactionHandle,
  ) {}

  async query<T>(query: SqlQuery): Promise<T[]> {
    const { sql, params } = unwrapQuery(query);
    return this.engine.queryInTransaction<T>(this.handle, sql, params);
  }

  async queryOne<T>(query: SqlQuery): Promise<T | null> {
    const { sql, params } = unwrapQuery(query);
    const rows = await this.engine.queryInTransaction<T>(this.handle, sql, params);
    return rows[0] ?? null;
  }

  async execute(query: SqlQuery): Promise<{ rowCount: number }> {
    const { sql, params } = unwrapQuery(query);
    return this.engine.executeInTransaction(this.handle, sql, params);
  }
}

/**
 * Shared Database logic that delegates to a DatabaseEngine.
 * Used by both index.mock.ts and index.aws.ts to avoid duplicating
 * the query/execute/transaction wrapper logic.
 *
 * @example
 * import { sql } from '@aws-blocks/data-common';
 * const base = new DatabaseBase(new PGliteEngine('.bb-data'));
 * const rows = await base.query<User>(sql`SELECT * FROM users WHERE age > ${18}`);
 */
export class DatabaseBase {
  constructor(protected engine: DatabaseEngine) {}

  /** Get the underlying engine. Used by the Kysely adapter. */
  getEngine(): DatabaseEngine {
    return this.engine;
  }

  /**
   * Execute a SQL query and return all matching rows.
   *
   * @param query - A `sql` tagged template expression
   * @returns Array of rows. Empty array if no matches.
   * @throws {QueryFailed} If the query fails
   */
  async query<T>(query: SqlQuery): Promise<T[]> {
    const { sql, params } = unwrapQuery(query);
    return this.engine.query<T>(sql, params);
  }

  /**
   * Execute a SQL query and return the first row or null.
   *
   * @param query - A `sql` tagged template expression
   * @returns The first row, or null if no rows match.
   * @throws {QueryFailed} If the query fails
   */
  async queryOne<T>(query: SqlQuery): Promise<T | null> {
    const { sql, params } = unwrapQuery(query);
    const rows = await this.engine.query<T>(sql, params);
    return rows[0] ?? null;
  }

  /**
   * Execute a SQL statement that modifies data.
   *
   * @param query - A `sql` tagged template expression
   * @returns Object with the number of rows affected.
   * @throws {QueryFailed} If the statement fails
   * @throws {UniqueConstraintViolation} If a unique constraint is violated
   */
  async execute(query: SqlQuery): Promise<{ rowCount: number }> {
    const { sql, params } = unwrapQuery(query);
    return this.engine.execute(sql, params);
  }

  /**
   * Execute a function within a database transaction.
   * Auto-commits on success, auto-rolls back if the function throws.
   *
   * @param fn - Function receiving a {@link Transaction} with query/queryOne/execute methods
   * @returns The value returned by `fn`
   * @throws {TransactionFailed} If the transaction cannot be committed
   *   or if `fn` throws a non-database error
   *
   * @example
   * import { sql } from '@aws-blocks/data-common';
   * await db.transaction(async (tx) => {
   *   await tx.execute(sql`UPDATE accounts SET balance = balance - ${100} WHERE id = ${fromId}`);
   *   await tx.execute(sql`UPDATE accounts SET balance = balance + ${100} WHERE id = ${toId}`);
   * });
   */
  async transaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
    const handle = await this.engine.beginTransaction();
    try {
      const tx = new TransactionImpl(this.engine, handle);
      const result = await fn(tx);
      await this.engine.commitTransaction(handle);
      return result;
    } catch (e) {
      await this.engine.rollbackTransaction(handle).catch(() => {});
      throw e;
    }
  }
}
