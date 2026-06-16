// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import type { PackResult } from "./publishers/types.ts";

interface RegistryMetadata {
	name: string;
	"dist-tags": Record<string, string>;
	versions: Record<string, Record<string, unknown>>;
}

/**
 * Generate npm registry metadata (index.json) for a package.
 * Merges with existing metadata to preserve previous versions.
 */
export function generateRegistryMetadata(
	packResult: PackResult,
	baseUrl: string,
	existing: RegistryMetadata | null,
	distTag: string = "latest",
): RegistryMetadata {
	const { packageName, version, tarballS3Key, integrity, shasum, packageJson } = packResult;

	const versionEntry: Record<string, unknown> = {
		name: packageName,
		version,
	};

	// Copy relevant fields from package.json
	for (const field of ["type", "exports", "main", "bin", "dependencies", "peerDependencies"]) {
		if (packageJson[field] !== undefined) {
			versionEntry[field] = packageJson[field];
		}
	}

	versionEntry.dist = {
		tarball: `${baseUrl}/${tarballS3Key}`,
		integrity,
		shasum,
	};

	const metadata: RegistryMetadata = existing
		? structuredClone(existing)
		: { name: packageName, "dist-tags": {}, versions: {} };

	metadata.versions[version] = versionEntry;
	metadata["dist-tags"][distTag] = version;

	// Only update "latest" when publishing a stable release
	if (distTag === "latest") {
		metadata["dist-tags"].latest = version;
	}

	return metadata;
}

/**
 * Parse existing registry metadata from a Buffer, returning null if invalid.
 */
export function parseExistingMetadata(buf: Buffer): RegistryMetadata | null {
	try {
		return JSON.parse(buf.toString("utf-8"));
	} catch {
		return null;
	}
}
