// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Runs Biome's noUndeclaredDependencies rule on package source files only.
 *
 * Excludes templates, dist, scripts, test-support, and test/cdk files —
 * these have legitimately different resolution contexts (esbuild-bundled,
 * devDependencies, host-project resolution, etc.).
 *
 * This replaces scripts/check-undeclared-dependencies.ts with a zero-config
 * Biome-native solution that resolves the closest package.json per file.
 *
 * Run: npx tsx scripts/lint-deps.ts
 */

import { readdirSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const PACKAGES_DIR = join(ROOT, 'packages');
const BIOME_BIN = join(ROOT, 'node_modules', '.bin', 'biome');

const EXCLUDED_DIRS = new Set(['templates', 'dist', 'scripts', 'test-support', 'test-fixtures', 'node_modules']);

const EXCLUDED_SUFFIXES = ['.test.ts', '.spec.ts', '.cdk.ts', '.e2e.test.ts'];

function collectSourceFiles(dir: string): string[] {
	const files: string[] = [];

	function walk(current: string) {
		for (const entry of readdirSync(current, { withFileTypes: true })) {
			const full = join(current, entry.name);

			if (entry.isDirectory()) {
				if (EXCLUDED_DIRS.has(entry.name)) continue;
				walk(full);
			} else if (entry.isFile() && extname(entry.name) === '.ts') {
				// Only include files under a src/ directory
				const rel = relative(PACKAGES_DIR, full);
				if (!rel.includes('/src/')) continue;

				// Exclude test/cdk/e2e suffixes
				if (EXCLUDED_SUFFIXES.some(suffix => entry.name.endsWith(suffix))) continue;

				files.push(full);
			}
		}
	}

	walk(dir);
	return files;
}

function main() {
	const files = collectSourceFiles(PACKAGES_DIR);

	if (files.length === 0) {
		console.log('No source files found to check.');
		process.exit(0);
	}

	console.log(`Checking ${files.length} source files for undeclared dependencies...`);

	// Pass files as arguments to biome lint — invoke the binary directly
	// (not via npx) to avoid CodeQL shell-injection warnings.
	const fileArgs = files.map(f => relative(ROOT, f));
	try {
		execFileSync(BIOME_BIN, ['lint', '--only=correctness/noUndeclaredDependencies', ...fileArgs], {
			cwd: ROOT,
			stdio: 'inherit',
		});
		console.log(`✓ All ${files.length} source files have correctly declared dependencies.`);
	} catch {
		process.exit(1);
	}
}

main();
