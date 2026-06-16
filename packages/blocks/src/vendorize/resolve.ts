// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

export interface ResolvedPackage {
  packageName: string;
  packageJsonPath: string;
}

/**
 * Resolve user input to a package name and its package.json path.
 *
 * Resolution order:
 * 1. If input is a resolvable package name with src/ → use directly
 * 2. If input matches a key or value in a direct dep's aws-blocks.vendorize map → use that package
 * 3. Fail with helpful error
 */
export function resolveInput(input: string): ResolvedPackage {
  // 1. Try as a direct package name
  const direct = findPackageJson(input);
  if (direct) return { packageName: input, packageJsonPath: direct };

  // 2. Scan direct deps for aws-blocks.vendorize maps
  const fromMap = resolveFromVendorizeMaps(input);
  if (fromMap) return fromMap;

  console.error(`Error: Cannot resolve "${input}" to a vendorizable package.`);
  console.error('Pass a full package name or a Building Block name (e.g., Realtime, KVStore).');
  process.exit(1);
}

/** Walk up from cwd to find a package in node_modules. */
export function findPackageJson(packageName: string): string | null {
  const parts = packageName.split('/');
  let dir = process.cwd();
  while (dir !== dirname(dir)) {
    const candidate = join(dir, 'node_modules', ...parts, 'package.json');
    if (existsSync(candidate)) {
      const pkg = JSON.parse(readFileSync(candidate, 'utf-8'));
      if (pkg.name === packageName) return candidate;
    }
    dir = dirname(dir);
  }
  return null;
}

/**
 * Scan direct dependencies for aws-blocks.vendorize maps.
 * Checks each dep's package.json for a `aws-blocks.vendorize` field and matches
 * the input (case-insensitive) against keys (package names) or values (BB names).
 */
function resolveFromVendorizeMaps(input: string): ResolvedPackage | null {
  const lower = input.toLowerCase();

  for (const pkgJsonPath of iterateDirectDepPackageJsons()) {
    const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
    const map: Record<string, string[]> | undefined = pkg['aws-blocks']?.vendorize;
    if (!map) continue;

    for (const [packageName, bbNames] of Object.entries(map)) {
      // Match against package name
      if (packageName.toLowerCase() === lower) {
        const resolved = findPackageJson(packageName);
        if (resolved) return { packageName, packageJsonPath: resolved };
      }
      // Match against BB names
      if (bbNames.some(name => name.toLowerCase() === lower)) {
        const resolved = findPackageJson(packageName);
        if (resolved) return { packageName, packageJsonPath: resolved };
      }
    }
  }

  return null;
}

/** Yield package.json paths from the nearest node_modules with scoped packages. */
function* iterateDirectDepPackageJsons(): Generator<string> {
  let dir = process.cwd();
  while (dir !== dirname(dir)) {
    const nm = join(dir, 'node_modules');
    if (existsSync(nm)) {
      let found = false;
      for (const entry of safeReaddir(nm)) {
        if (entry.startsWith('@')) {
          for (const sub of safeReaddir(join(nm, entry))) {
            const pj = join(nm, entry, sub, 'package.json');
            if (existsSync(pj)) { yield pj; found = true; }
          }
        }
      }
      if (found) return;
    }
    dir = dirname(dir);
  }
}

function safeReaddir(dir: string): string[] {
  try { return readdirSync(dir); } catch { return []; }
}
