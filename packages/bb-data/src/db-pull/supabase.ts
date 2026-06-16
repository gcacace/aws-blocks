// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Supabase-specific knowledge for `db pull`.
 *
 * `db pull` is intended to become provider-agnostic (Neon, etc.). Today Supabase
 * is the only supported provider, and every assumption that is true *only* for
 * Supabase is quarantined here so the rest of the pipeline (introspection, file
 * generation, orchestration) stays generic. When a second provider lands, this
 * module is the template for a `DatabaseProvider` implementation — promoting these
 * constants to an interface is then an additive step (see the db-pull-improvements
 * tracking doc, OQ-4).
 *
 * ⚠️  IDENTIFIER STABILITY: `scopeName`, `generatedDbFile`, `crudExportName`,
 * and `connStringEnvVar` are load-bearing for backward compatibility with
 * already-deployed apps. They must stay byte-stable — generalize the *seam*,
 * not the values.
 *
 * @module
 */

/** Stable identifiers emitted into generated code / written to disk. Do NOT change. */
export const SUPABASE = {
  id: 'supabase',
  displayName: 'Supabase',
  /** CDK `Scope` name in generated wiring — kept for CDK backward compatibility. */
  scopeName: 'supabase',
  /** Generated wiring file name (holds the Database BB + CRUD spread fn). */
  generatedDbFile: 'supabase.ts',
  /** Exported "spread into your ApiNamespace" function name. */
  crudExportName: 'supabaseCrud',
  /** Env var holding the connection string in `.env.local` / `.env.production`. */
  connStringEnvVar: 'SUPABASE_DB_URL',
} as const;

/**
 * Extract the Supabase project ref from a connection string. Supabase encodes it
 * in the username as `postgres.<ref>`. Returns undefined for a non-Supabase string.
 */
export function extractProjectRef(connectionString: string): string | undefined {
  return connectionString.match(/postgres\.([a-z0-9]+)/)?.[1];
}

/**
 * RLS / auth facts that are specific to Supabase's managed-auth model. Generic
 * Postgres (e.g. Neon) has no `authenticated` role and no `auth.*()` functions.
 */
export const SUPABASE_AUTH = {
  /**
   * RLS policy functions that depend on Supabase's internal user store and won't
   * work post-migration (tables using them are skipped). `auth.jwt()` is
   * deliberately NOT here — it just reads the JWT payload, which `withRLS()` sets,
   * so it is OIDC-compatible.
   *
   * No `g` flag — `test()` must stay stateless across the per-policy loop in
   * introspect.ts; a global regex would carry `lastIndex` between calls and start
   * returning wrong results. Do not add it.
   */
  authFnPattern: /\bauth\.(uid|email|role)\s*\(/,
  /** Role that runtime clients connect as; eligible tables must grant it CRUD. */
  authenticatedRole: 'authenticated',
  /** Privileges every eligible table must grant `authenticatedRole`. */
  requiredGrants: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'] as const,
  /** JWT claims `withRLS()` handles implicitly; anything else is "non-standard". */
  standardClaims: ['sub', 'role'] as const,
} as const;

/** Where to find the connection string — shown in the interactive prompt. */
export const SUPABASE_CONN_GUIDANCE: readonly string[] = [
  '  Find your connection string in the Supabase Dashboard:',
  '  Project Settings → Database → Connection string → URI (Session mode, port 5432)',
];

/**
 * Customer-facing, provider-specific strings surfaced by the interactive flow.
 * These live on the provider so the orchestration in `pull.ts` stays free of
 * `provider === 'supabase'` conditionals — adding a second provider supplies its
 * own values rather than editing branching in the orchestrator (R3 seam).
 */
export const SUPABASE_MESSAGING = {
  /** Auth-column label in the eligibility table for provider-managed auth. */
  authEligibilityLabel: 'Supabase Auth',
  /** Eligibility reason when a table uses provider-managed auth (not yet supported). */
  authIneligibleReason: 'No — Supabase Auth not yet supported',
  /** Where the customer runs the GRANT statements. */
  grantSqlLocation: 'run in Supabase SQL editor',
} as const;

/**
 * Detect whether a connection string belongs to this provider. Supabase pooler
 * URLs carry the project ref in the username (`postgres.<ref>`); a non-Supabase
 * string has no such ref. Used by the interactive flow to auto-select the
 * provider (and to print `Detected provider: Supabase`) instead of forcing a
 * one-item menu.
 */
export function detectSupabase(connectionString: string): boolean {
  return extractProjectRef(connectionString) !== undefined;
}
