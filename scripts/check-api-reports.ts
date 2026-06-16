// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Verifies that API.md reports are up-to-date and contain no error tokens.
 * Run after `npm run update:api` — fails if any API.md file has uncommitted
 * changes, indicating the developer forgot to regenerate the API report.
 */

import { execSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const PACKAGES_DIR = join(ROOT, "packages");

const ERROR_TOKENS: string[] = [];
const WARNING_TOKENS = ["ae-forgotten-export"];
const FORBIDDEN_IMPORTS = /import { .* } from '\.\//;

// 1. Check for uncommitted API.md changes
const gitDiff = execSync("git diff --name-only", {
	cwd: ROOT,
	encoding: "utf-8",
});

const updatedAPIFiles = gitDiff
	.split("\n")
	.filter((file) => /\/API(-\w+)?\.md$/.test(file));

if (updatedAPIFiles.length > 0) {
	console.error(
		`\n❌ API reports are out of date:\n${updatedAPIFiles.map((f) => `   • ${f}`).join("\n")}` +
		`\n\nRun 'npm run update:api' and commit the updated API.md files.\n`,
	);
	process.exit(1);
}

// 2. Scan existing API.md files for error tokens and forbidden imports
const packageDirs = readdirSync(PACKAGES_DIR, { withFileTypes: true })
	.filter((d) => d.isDirectory())
	.map((d) => d.name);

const errors: string[] = [];
const warnings: string[] = [];

for (const dir of packageDirs) {
	const pkgDir = join(PACKAGES_DIR, dir);
	const apiFiles = readdirSync(pkgDir)
		.filter((f) => /^API(-\w+)?\.md$/.test(f));

	for (const fileName of apiFiles) {
		const apiFile = join(pkgDir, fileName);
		const content = readFileSync(apiFile, "utf-8");
		const label = `packages/${dir}/${fileName}`;

		for (const token of ERROR_TOKENS) {
			if (content.includes(token)) {
				errors.push(`Found error token [${token}] in ${label}`);
			}
		}

		for (const token of WARNING_TOKENS) {
			if (content.includes(token)) {
				warnings.push(`Found warning token [${token}] in ${label}`);
			}
		}

		const forbiddenImports = content.match(FORBIDDEN_IMPORTS);
		if (forbiddenImports) {
			for (const imp of forbiddenImports) {
				errors.push(
					`Found forbidden local import ${imp} in ${label} — did you forget to export a type?`,
				);
			}
		}
	}
}

if (warnings.length > 0) {
	console.warn(
		`\n⚠️  Warnings in API reports (non-blocking):\n${warnings.map((w) => `   • ${w}`).join("\n")}\n`,
	);
}

if (errors.length > 0) {
	console.error(
		`\n❌ Problems found in API reports:\n${errors.map((e) => `   • ${e}`).join("\n")}` +
		`\n\nFix these issues and regenerate with 'npm run update:api'.\n`,
	);
	process.exit(1);
}

console.log("✓ All API reports are up-to-date.");
