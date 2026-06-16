// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Minimal RFC-6238 TOTP code generator for integration tests.
 *
 * Production apps should use `otpauth` or similar; this helper exists solely
 * so the integration-test harness doesn't need a dev-dep bump for a feature
 * that's only called in real-Cognito test runs.
 */
import crypto from 'node:crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(encoded: string): Buffer {
	const clean = encoded.replace(/=+$/, '').toUpperCase();
	let bits = '';
	for (const ch of clean) {
		const idx = BASE32_ALPHABET.indexOf(ch);
		if (idx < 0) throw new Error(`invalid base32 char: ${ch}`);
		bits += idx.toString(2).padStart(5, '0');
	}
	const bytes: number[] = [];
	for (let i = 0; i + 8 <= bits.length; i += 8) {
		bytes.push(parseInt(bits.slice(i, i + 8), 2));
	}
	return Buffer.from(bytes);
}

/** Generate the current RFC-6238 TOTP code for `sharedSecret` (base32). */
export function totpNow(sharedSecret: string, timeStep = 30): string {
	const secret = base32Decode(sharedSecret);
	const counter = Math.floor(Date.now() / 1000 / timeStep);
	const buf = Buffer.alloc(8);
	buf.writeBigUInt64BE(BigInt(counter), 0);
	const hmac = crypto.createHmac('sha1', secret).update(buf).digest();
	const offset = hmac[hmac.length - 1]! & 0x0f;
	const bin =
		((hmac[offset]! & 0x7f) << 24) |
		((hmac[offset + 1]! & 0xff) << 16) |
		((hmac[offset + 2]! & 0xff) << 8) |
		(hmac[offset + 3]! & 0xff);
	return (bin % 1_000_000).toString().padStart(6, '0');
}
