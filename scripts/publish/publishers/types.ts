// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

export interface PublishFile {
	key: string;
	body: Buffer;
	contentType: string;
}

export interface Publisher {
	upload(files: PublishFile[]): Promise<void>;
	fetchExisting(key: string): Promise<Buffer | null>;
	invalidateCache(paths: string[]): Promise<void>;
	getBaseUrl(): string;
}

export interface PackageJson {
	name: string;
	version: string;
	type?: string;
	exports?: unknown;
	main?: string;
	bin?: unknown;
	dependencies?: Record<string, string>;
	peerDependencies?: Record<string, string>;
	[key: string]: unknown;
}

export interface PackageInfo {
	name: string;
	version: string;
	packageJsonPath: string;
	packageJson: PackageJson;
	dirPath: string;
}

export interface PackResult {
	packageName: string;
	version: string;
	tarballPath: string;
	tarballS3Key: string;
	integrity: string;
	shasum: string;
	packageJson: PackageJson;
}
