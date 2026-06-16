// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { timingSafeEqual } from 'node:crypto';

/**
 * Compares two strings in constant time to prevent timing side-channel attacks.
 * Use this for HMAC signature validation — never use === or !== for crypto comparisons.
 */
export function constantTimeEquals(a: string, b: string): boolean {
	const ab = Buffer.from(a, 'utf8');
	const bb = Buffer.from(b, 'utf8');
	if (ab.length !== bb.length) return false;
	return timingSafeEqual(ab, bb);
}
