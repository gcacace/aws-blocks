// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import type { ExternalDatabaseRef } from './types.js';

/**
 * Reference an existing database not managed by the Database Building Block.
 * Pass the returned reference to the Database constructor's `connection` option.
 *
 * Supports two forms:
 * - `{ connectionString }` — direct connection (Supabase, Neon, etc.)
 * - `{ host, port, database, secretArn }` — AWS-managed (Aurora via Secrets Manager)
 *
 * @param config - Connection details for the external database
 * @returns The config object (passthrough)
 */
export const fromExisting = (config: ExternalDatabaseRef): ExternalDatabaseRef => config;
