// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { createHmac } from 'node:crypto';
import { constantTimeEquals } from '@aws-blocks/core/bb-utils';

// ── Token helpers ───────────────────────────────────────────────────────────

export const LOCAL_FILE_SECRET = '__blocks_file_bucket_dev_secret__';

interface FileTokenPayload {
	fullId: string;
	path: string;
	method: 'GET' | 'PUT';
	contentType?: string;
	exp: number;
}

export function mintFileToken(
	fullId: string,
	path: string,
	method: 'GET' | 'PUT',
	expiresIn: number,
	secret: string,
	contentType?: string,
): string {
	const payload: FileTokenPayload = {
		fullId,
		path,
		method,
		exp: Math.floor(Date.now() / 1000) + expiresIn,
		...(contentType ? { contentType } : {}),
	};
	const json = JSON.stringify(payload);
	const sig = createHmac('sha256', secret).update(json).digest('base64url');
	return `${Buffer.from(json).toString('base64url')}.${sig}`;
}

export function validateFileToken(
	token: string,
	secret: string,
	expectedFullId: string,
	expectedPath: string,
	expectedMethod: 'GET' | 'PUT',
): FileTokenPayload | null {
	try {
		const [payloadB64, sig] = token.split('.');
		if (!payloadB64 || !sig) return null;
		const json = Buffer.from(payloadB64, 'base64url').toString();
		const expectedSig = createHmac('sha256', secret).update(json).digest('base64url');
		if (!constantTimeEquals(sig, expectedSig)) return null;
		const payload: FileTokenPayload = JSON.parse(json);
		if (payload.exp < Math.floor(Date.now() / 1000)) return null;
		if (payload.fullId !== expectedFullId) return null;
		if (payload.path !== expectedPath) return null;
		if (payload.method !== expectedMethod) return null;
		return payload;
	} catch {
		return null;
	}
}
