// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Verify that every publishable package with file changes has a corresponding
 * changeset entry. Exits non-zero if any package is missing coverage.
 *
 * Used in CI to prevent the root cause of EINTEGRITY errors: a package gets
 * changed but its version isn't bumped because the changeset forgot to mention it.
 */

import { execSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const PACKAGES_DIR = join(ROOT, "packages");
const CHANGESET_DIR = join(ROOT, ".changeset");
const SCOPE = "@aws-blocks/";

// ── 1. Get changed files from git diff ─────────────────────────────

function getChangedFiles(): string[] {
	const mergeBase = execSync("git merge-base origin/main HEAD", {
		cwd: ROOT,
		encoding: "utf-8",
	}).trim();
	const output = execSync(`git diff --name-only ${mergeBase}`, {
		cwd: ROOT,
		encoding: "utf-8",
	});
	return output.trim().split("\n").filter(Boolean);
}

// ── 2. Map changed files → package names ────────────────────────────

function getChangedPackages(changedFiles: string[]): Set<string> {
	const packages = new Set<string>();

	for (const file of changedFiles) {
		// Only care about files under packages/
		const match = file.match(/^packages\/([^/]+)\//);
		if (!match) continue;

		const dirName = match[1];
		const pkgJsonPath = join(PACKAGES_DIR, dirName, "package.json");

		if (!existsSync(pkgJsonPath)) continue;

		try {
			const pkgJson = JSON.parse(readFileSync(pkgJsonPath, "utf-8"));
			if (typeof pkgJson.name === "string" && pkgJson.name.startsWith(SCOPE)) {
				packages.add(pkgJson.name);
			}
		} catch {
			// skip unreadable package.json
		}
	}

	return packages;
}

// ── 3. Parse changeset files → covered package names ────────────────

function getCoveredPackages(): Set<string> {
	const covered = new Set<string>();

	if (!existsSync(CHANGESET_DIR)) return covered;

	const files = readdirSync(CHANGESET_DIR).filter(
		(f) => f.endsWith(".md") && f !== "README.md",
	);

	for (const file of files) {
		const content = readFileSync(join(CHANGESET_DIR, file), "utf-8");

		// Extract YAML frontmatter between --- delimiters
		const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
		if (!frontmatterMatch) continue;

		const frontmatter = frontmatterMatch[1];

		// Each line in the frontmatter is like: "@aws-blocks/core": patch
		// or quoted: '"@aws-blocks/core"': patch
		for (const line of frontmatter.split("\n")) {
			const pkgMatch = line.match(/['"]?(@aws-blocks\/[^'":\s]+)['"]?\s*:/);
			if (pkgMatch) {
				covered.add(pkgMatch[1]);
			}
		}
	}

	return covered;
}

// ── 4. Compare and report ───────────────────────────────────────────

const changedFiles = getChangedFiles();
const changedPackages = getChangedPackages(changedFiles);
const coveredPackages = getCoveredPackages();

const missing = [...changedPackages].filter((pkg) => !coveredPackages.has(pkg));

if (missing.length > 0) {
	console.error("\n❌ The following packages have file changes but no changeset entry:\n");
	for (const pkg of missing.sort()) {
		console.error(`   • ${pkg}`);
	}
	console.error(
		"\nAdd a changeset covering these packages: npx changeset\n" +
		"An empty changeset (--empty) does NOT satisfy this check.\n",
	);
	process.exit(1);
} else if (changedPackages.size > 0) {
	console.log(`✓ All ${changedPackages.size} changed package(s) are covered by changesets.`);
} else {
	console.log("✓ No publishable packages were changed.");
}
