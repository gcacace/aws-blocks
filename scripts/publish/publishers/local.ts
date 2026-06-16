// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Publisher, PublishFile } from "./types.ts";

export class LocalPublisher implements Publisher {
	constructor(private outDir: string) {}

	async upload(files: PublishFile[]): Promise<void> {
		for (const file of files) {
			const filePath = join(this.outDir, file.key);
			await mkdir(dirname(filePath), { recursive: true });
			await writeFile(filePath, file.body);
		}
	}

	async fetchExisting(key: string): Promise<Buffer | null> {
		try {
			return await readFile(join(this.outDir, key));
		} catch {
			return null;
		}
	}

	async invalidateCache(_paths: string[]): Promise<void> {
		// no-op for local publisher
	}

	getBaseUrl(): string {
		return `http://localhost:4873`;
	}
}
