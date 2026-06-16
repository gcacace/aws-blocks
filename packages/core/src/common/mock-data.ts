// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import type { Scope } from './index.js';

/**
 * Options for {@link getMockDataDir}.
 */
export interface MockDataDirOptions {
  /**
   * When true, returns the root `.bb-data/` directory without appending
   * the scope's fullId. Use this to consolidate all data from a single resource
   * type into a single file or folder. E.g., `settings.json`.
   */
  root?: boolean;
}

/**
 * Returns the mock data directory for a Building Block instance, creating it
 * if it doesn't already exist.
 *
 * Resolves to `<cwd>/.bb-data/{scope.fullId}/` by default. The BB owns this
 * folder and can store whatever files it needs inside it.
 * 
 * If `root: true` are specified, returns `<cwd>/.bb-data/`. The BB must then
 * take responsibility not to conflict with other files and folders.
 *
 * @param scope - The Building Block's Scope instance.
 * @param options - Optional configuration.
 * @returns Absolute path to the BB's data directory (guaranteed to exist).
 *
 * @example
 * ```typescript
 * const dir = getMockDataDir(this);
 * const filePath = join(dir, 'store.json');
 * ```
 *
 * @example Root directory for shared files
 * ```typescript
 * const dir = getMockDataDir(this, { root: true });
 * const settingsPath = join(dir, 'settings.json');
 * ```
 */
export function getMockDataDir(scope: Scope, options?: MockDataDirOptions): string {
  const segments = [process.cwd(), '.bb-data'];
  if (!options?.root) segments.push(scope.fullId);
  const dir = join(...segments);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}
