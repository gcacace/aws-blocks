// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import {
  Kysely,
  PostgresDialect,
  type Dialect,
  type Driver,
  type DatabaseConnection,
  type CompiledQuery,
  type QueryResult,
} from 'kysely';
import type { DatabaseEngine, TransactionHandle } from './engine.js';

/**
 * An engine value that may not be resolved yet. The public `Database` class
 * exposes `getEngine(): Promise<DatabaseEngine>` (it lazily initializes the
 * underlying pool/Data API client), while the lower-level
 * `RLSEnabledDatabase`/`DatabaseBase` expose it synchronously. The adapter
 * accepts either and resolves lazily inside its already-async hooks.
 */
type EngineSource = DatabaseEngine | Promise<DatabaseEngine>;

/**
 * Kysely connection that routes queries through a DatabaseEngine.
 * When a transaction is active (handle is set), queries are routed through
 * the engine's transaction-scoped methods to ensure atomicity on pooled engines.
 */
class EngineConnection implements DatabaseConnection {
  handle: TransactionHandle | null = null;
  private enginePromise: Promise<DatabaseEngine>;

  constructor(engineSource: EngineSource) {
    this.enginePromise = Promise.resolve(engineSource);
  }

  async executeQuery<R>(compiledQuery: CompiledQuery): Promise<QueryResult<R>> {
    const engine = await this.enginePromise;
    if (this.handle) {
      const rows = await engine.queryInTransaction<R>(
        this.handle,
        compiledQuery.sql,
        compiledQuery.parameters as unknown[],
      );
      return { rows };
    }
    const rows = await engine.query<R>(compiledQuery.sql, compiledQuery.parameters as unknown[]);
    return { rows };
  }

  /** Begin a transaction on this connection's engine. */
  async begin(): Promise<void> {
    const engine = await this.enginePromise;
    this.handle = await engine.beginTransaction();
  }

  /** Commit the active transaction (if any). */
  async commit(): Promise<void> {
    if (this.handle) {
      const engine = await this.enginePromise;
      await engine.commitTransaction(this.handle);
      this.handle = null;
    }
  }

  /** Roll back the active transaction (if any). */
  async rollback(): Promise<void> {
    if (this.handle) {
      const engine = await this.enginePromise;
      await engine.rollbackTransaction(this.handle);
      this.handle = null;
    }
  }

  streamQuery<R>(): AsyncIterableIterator<QueryResult<R>> {
    throw new Error('Streaming is not supported by the Database engine');
  }
}

/**
 * Kysely driver that delegates to a DatabaseEngine for connections and transactions.
 * Uses the engine's handle-based transaction API so BEGIN/statements/COMMIT all
 * run on the same connection — critical for pooled and stateless (Data API) engines.
 */
class EngineDriver implements Driver {
  constructor(private engineSource: EngineSource) {}

  async init(): Promise<void> {}

  async acquireConnection(): Promise<DatabaseConnection> {
    return new EngineConnection(this.engineSource);
  }

  async beginTransaction(connection: DatabaseConnection): Promise<void> {
    await (connection as EngineConnection).begin();
  }

  async commitTransaction(connection: DatabaseConnection): Promise<void> {
    await (connection as EngineConnection).commit();
  }

  async rollbackTransaction(connection: DatabaseConnection): Promise<void> {
    await (connection as EngineConnection).rollback();
  }

  async releaseConnection(): Promise<void> {}
  async destroy(): Promise<void> {}
}

/**
 * Kysely dialect backed by a DatabaseEngine.
 * Reuses PostgresDialect internals for query compilation and introspection.
 */
class EngineDialect implements Dialect {
  constructor(private engineSource: EngineSource) {}

  createDriver(): Driver {
    return new EngineDriver(this.engineSource);
  }

  createQueryCompiler() {
    return new PostgresDialect({ pool: null as any }).createQueryCompiler();
  }

  createAdapter() {
    return new PostgresDialect({ pool: null as any }).createAdapter();
  }

  createIntrospector(db: Kysely<any>) {
    return new PostgresDialect({ pool: null as any }).createIntrospector(db);
  }
}

/**
 * Create a Kysely query builder backed by a Database instance's engine.
 * Kysely must be installed as a peer dependency.
 *
 * Queries go through the same DatabaseEngine and error handling as raw SQL calls.
 *
 * Accepts a `getEngine()` that returns the engine either synchronously
 * (`RLSEnabledDatabase`) or as a `Promise` (the public `Database` class, which
 * initializes its pool/Data API client lazily). The engine is resolved lazily
 * on first query, so passing a `Database` instance directly works without
 * `await` or casts.
 *
 * @param db - A Database instance (from index.mock.ts or index.aws.ts) or any
 *             object exposing `getEngine()`.
 * @returns A Kysely instance typed with the provided schema
 *
 * @example
 * import { Scope } from '@aws-blocks/core';
 * import { Database, createKyselyAdapter } from '@aws-blocks/bb-data';
 *
 * interface Schema {
 *   users: { id: string; name: string; email: string };
 *   posts: { id: string; user_id: string; title: string };
 * }
 *
 * const scope = new Scope('my-app');
 * const db = new Database(scope, 'main');
 * const kysely = createKyselyAdapter<Schema>(db);
 *
 * // Type-safe queries:
 * const users = await kysely.selectFrom('users').selectAll().execute();
 * await kysely.insertInto('users').values({ id: '1', name: 'Alice', email: 'a@b.com' }).execute();
 *
 * // Joins:
 * const posts = await kysely
 *   .selectFrom('posts')
 *   .innerJoin('users', 'users.id', 'posts.user_id')
 *   .select(['posts.title', 'users.name'])
 *   .execute();
 */
export function createKyselyAdapter<T>(
  db: { getEngine(): DatabaseEngine | Promise<DatabaseEngine> },
): Kysely<T> {
  return new Kysely<T>({ dialect: new EngineDialect(db.getEngine()) });
}
