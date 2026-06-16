// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Negative type tests for `confirmSignIn`'s discriminated overloads.
 *
 * Same contract as `types.types-test.ts` — no runtime assertions, the
 * compile is the test.
 *
 * @internal
 */

import type { BlocksContext } from '@aws-blocks/core';
import type { AuthCognito } from './index.js';

declare const ctx: BlocksContext;

const narrowOpts = {
	mfaTypes: ['TOTP'] as const,
};

declare const narrow: AuthCognito<typeof narrowOpts>;
declare const wide: AuthCognito;

async function confirmSignInPositive() {
	// `{ code }` — SMS / TOTP / Email / TOTP-setup / Email-setup.
	await narrow.confirmSignIn('session', { code: '123456' }, ctx);
	// `{ newPassword }` — NEW_PASSWORD_REQUIRED.
	await narrow.confirmSignIn('session', { newPassword: 'NewP@ss1' }, ctx);
	// `{ mfaType }` — MFA_SELECTION / MFA_SETUP_SELECTION. Narrowed.
	await narrow.confirmSignIn('session', { mfaType: 'TOTP' }, ctx);

	// Raw-string overload remains for the state-machine dispatcher that
	// receives untyped form fields. Existing call sites keep compiling.
	await narrow.confirmSignIn('session', '123456', ctx);
}

async function confirmSignInNegative() {
	// Note: TS's excess-property check is intentionally loose on
	// discriminated unions — `{ code, newPassword }` happens to satisfy
	// two branches and is legal. The tests below cover the cases that
	// are caught (wrong value in `mfaType`, empty object, unknown key).
	// @ts-expect-error — 'SMS' is not in the configured mfaTypes.
	await narrow.confirmSignIn('session', { mfaType: 'SMS' }, ctx);
	// @ts-expect-error — empty object doesn't match any branch.
	await narrow.confirmSignIn('session', {}, ctx);
	// @ts-expect-error — unknown property (doesn't satisfy any branch).
	await narrow.confirmSignIn('session', { unknownField: 'x' }, ctx);
}

async function confirmSignInWidePositive() {
	// Without `as const`, `mfaType` accepts the full union.
	await wide.confirmSignIn('session', { mfaType: 'SMS' }, ctx);
	await wide.confirmSignIn('session', { mfaType: 'TOTP' }, ctx);
	await wide.confirmSignIn('session', { mfaType: 'EMAIL' }, ctx);
}

void confirmSignInPositive; void confirmSignInNegative; void confirmSignInWidePositive;
