// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Negative type tests for `fetchAuthSession` JWT-payload narrowing and
 * `forgetDevice` required deviceKey.
 *
 * @internal
 */

import type { BlocksContext } from '@aws-blocks/core';
import type { AuthCognito } from './index.js';
import type { AuthStateApi } from '@aws-blocks/auth-common';

declare const ctx: BlocksContext;
declare const auth: AuthCognito;

async function payloadIsUnknown() {
	const session = await auth.fetchAuthSession(ctx);
	const sub = session.tokens?.idToken.payload.sub;
	// `sub` is `unknown` — narrowing is the feature.
	if (typeof sub === 'string') {
		const s: string = sub;
		void s;
	}
	// @ts-expect-error — implicit `string` use on unknown is a type error.
	const asStringDirect: string = session.tokens?.idToken.payload.sub;
	void asStringDirect;
}

async function forgetDeviceRequiresKey() {
	// @ts-expect-error — `deviceKey` is now required.
	await auth.forgetDevice(ctx);
	await auth.forgetDevice(ctx, 'device-abc');
}

function createApiReturnsAuthStateApi() {
	const api: AuthStateApi = auth.createApi();
	void api;
}

void payloadIsUnknown; void forgetDeviceRequiresKey; void createApiReturnsAuthStateApi;
