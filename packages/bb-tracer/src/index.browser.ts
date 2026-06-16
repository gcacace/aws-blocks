// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

// Browser stub — Tracer runs server-side only.
// Provides a no-op implementation to prevent bundler errors.
export class Tracer {
	constructor(..._args: any[]) {}
	async startSegment<T>(_name: string, fn: (segment: any) => Promise<T>): Promise<T> {
		return fn({ addAnnotation() {}, addMetadata() {}, addError() {}, setHttpStatus() {} });
	}
	addAnnotation() {}
	addMetadata() {}
	getTraceId() { return null; }
}
