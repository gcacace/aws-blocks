// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile, rm, mkdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import type { Publisher, PublishFile } from "./types.ts";

/**
 * S3 publisher — uploads to S3 and invalidates CloudFront via AWS CLI.
 * Requires AWS credentials to be configured (e.g., via OIDC in GitHub Actions).
 *
 * Uses execFileSync (array form) instead of execSync to prevent shell injection.
 */
export class S3Publisher implements Publisher {
	constructor(
		private bucket: string,
		private cloudfrontDomain: string,
		private distributionId: string,
	) {}

	async upload(files: PublishFile[]): Promise<void> {
		const tmp = await mkdtemp(join(tmpdir(), "blocks-publish-"));
		try {
			for (const file of files) {
				const filePath = join(tmp, file.key);
				await mkdir(dirname(filePath), { recursive: true });
				await writeFile(filePath, file.body);

				execFileSync("aws", [
					"s3", "cp", filePath,
					`s3://${this.bucket}/${file.key}`,
					"--content-type", file.contentType,
				], { stdio: "inherit" });
			}
		} finally {
			await rm(tmp, { recursive: true, force: true });
		}
	}

	async fetchExisting(key: string): Promise<Buffer | null> {
		const tmp = await mkdtemp(join(tmpdir(), "blocks-fetch-"));
		const outPath = join(tmp, "file");
		try {
			execFileSync("aws", [
				"s3", "cp",
				`s3://${this.bucket}/${key}`,
				outPath,
			], { stdio: "pipe" });
			return await readFile(outPath);
		} catch {
			return null;
		} finally {
			await rm(tmp, { recursive: true, force: true });
		}
	}

	async invalidateCache(paths: string[]): Promise<void> {
		if (paths.length === 0) return;
		execFileSync("aws", [
			"cloudfront", "create-invalidation",
			"--distribution-id", this.distributionId,
			"--paths", ...paths,
		], { stdio: "inherit" });
	}

	getBaseUrl(): string {
		return `https://${this.cloudfrontDomain}`;
	}
}
