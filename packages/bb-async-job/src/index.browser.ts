// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

// Browser stub - AsyncJob runs server-side only
export class AsyncJob {
	constructor(...args: any[]) {}
}

export const AsyncJobErrors = {
	PayloadTooLarge: 'PayloadTooLargeException',
	BatchTooLarge: 'BatchTooLargeException',
	ValidationFailed: 'ValidationFailedException',
} as const;
