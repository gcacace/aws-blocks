// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Single source of truth for the SSM parameter name that stores an external
 * database connection string, and for the project ref derived from a Postgres
 * connection string.
 *
 * Both the deploy-time provisioner (`ensure-secrets`) and the `db pull`
 * generated code derive this name from the stage alone. Keep this the only
 * place the name is constructed.
 */

/**
 * Extract a stable identifier from a Postgres connection string.
 *
 * Maps the Supabase pooler form (`postgres.{ref}@`) and the direct form
 * (`db.{ref}.supabase.co`) to the same `{ref}`, so a project's connection string
 * yields one identifier regardless of which form the customer pastes. Falls back
 * to a sanitized hostname for non-Supabase hosts.
 */
export function extractDbRef(connectionString: string): string {
  // Supabase pooler: postgres.{ref}:pass@... or postgres.{ref}@...
  const pooler = connectionString.match(/postgres\.([a-z0-9]+)[:@]/i);
  if (pooler) return pooler[1];

  // Supabase direct: @db.{ref}.supabase.co
  const direct = connectionString.match(/@db\.([a-z0-9]+)\.supabase\.co/i);
  if (direct) return direct[1];

  // Generic host fallback
  const host = connectionString.match(/@([^:/?]+)/);
  if (host) return host[1].replace(/\./g, '-');

  throw new Error('Cannot extract database identifier from connection string.');
}

/** SSM parameter name storing the connection string for a given stage. */
export function dbConnectionParameterName(stage: string): string {
  return `/blocks/${stage}/db-connection-string`;
}
