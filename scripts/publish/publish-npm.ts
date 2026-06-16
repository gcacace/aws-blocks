// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Publish the publishable packages to the npm registry.
 *
 * Performs a real publish by default; that path adds --provenance and requires
 * NODE_AUTH_TOKEN to be set (and, for provenance, an OIDC-enabled CI such as
 * GitHub Actions with `id-token: write`).
 *
 * Pass --dry-run to only pack and validate without contacting the registry.
 *
 * Relies on npm workspaces: private workspaces (all test-apps and template
 * `aws-blocks` dirs) are skipped automatically, leaving only the
 * @aws-blocks/* packages under packages/.
 *
 * Usage:
 *   tsx scripts/publish/publish-npm.ts              # real publish
 *   tsx scripts/publish/publish-npm.ts --dry-run    # dry-run
 */

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");

const dryRun = process.argv.includes("--dry-run");

if (!dryRun && !process.env.NODE_AUTH_TOKEN) {
	console.error("✗ Real publish requested but NODE_AUTH_TOKEN is not set.");
	process.exit(1);
}

const args = ["publish", "--workspaces", "--access=public"];
if (dryRun) {
	args.push("--dry-run");
} 
// re-enable when repo is public
// else {
// 	args.push("--provenance");
// }

console.log(`AWS Blocks Publish — npm (${dryRun ? "dry-run" : "LIVE"})\n`);

execFileSync("npm", args, { cwd: ROOT, stdio: "inherit" });
