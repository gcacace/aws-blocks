// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Negative type tests for `AuthCognito`'s generic surface.
 *
 * These tests have no runtime assertions — the compile is the test. Each
 * `@ts-expect-error` line asserts that the following expression is
 * currently a type error; if the error ever goes away (e.g. the narrowing
 * regresses to the wide union), `tsc --build` fails and surfaces the
 * `@ts-expect-error` as the offender.
 *
 * If a test needs to be disabled temporarily, prefer deleting it over
 * converting to `@ts-expect-error` — the "ignore" form masks genuine type
 * regressions that these tests exist to prevent.
 *
 * @internal
 */

import type { BlocksContext } from '@aws-blocks/core';
import type { AuthCognito } from './index.js';

// Unused scope / ctx — we only care about the compile behavior of the
// types, not execution.
declare const scope: any;
declare const ctx: BlocksContext;

// ─────────────────────────────────────────────────────────────────────────────
// Setup 1: narrow options via `as const`
// ─────────────────────────────────────────────────────────────────────────────

const narrowOpts = {
	groups: ['admins', 'readers'] as const,
	userAttributes: [
		{ name: 'department', type: 'String' as const },
		{ name: 'employeeId', type: 'Number' as const },
	] as const,
	mfaTypes: ['TOTP', 'EMAIL'] as const,
};

declare const narrow: AuthCognito<typeof narrowOpts>;

// Positive — these must typecheck
async function narrowPositive() {
	await narrow.requireRole(ctx, 'admins');
	await narrow.requireRole(ctx, 'readers');
	await narrow.updateUserAttribute(ctx, 'custom:department', 'platform');
	await narrow.updateUserAttribute(ctx, 'department', 'platform');
	await narrow.updateUserAttribute(ctx, 'email', 'alice@example.com');
	await narrow.updateMFAPreference(ctx, { totp: 'PREFERRED' });
	await narrow.updateMFAPreference(ctx, { email: 'ENABLED' });
	await narrow.updateMFAPreference(ctx, { totp: 'DISABLED', email: 'DISABLED' });
}

// Negative — these must be compile errors. If any @ts-expect-error line
// stops flagging an error, that means the narrowing broke.
async function narrowNegative() {
	// @ts-expect-error — 'admin' (typo) is not in the configured groups.
	await narrow.requireRole(ctx, 'admin');
	// @ts-expect-error — 'viewers' is not in the configured groups.
	await narrow.requireRole(ctx, 'viewers');
	// @ts-expect-error — 'manager' was never declared as a custom attribute.
	await narrow.updateUserAttribute(ctx, 'custom:manager', 'alice');
	// @ts-expect-error — `sms` is not available on this pool (mfaTypes omits SMS).
	await narrow.updateMFAPreference(ctx, { sms: 'PREFERRED' });
	// @ts-expect-error — `sms` is not available on this pool; entire object rejected.
	await narrow.updateMFAPreference(ctx, { sms: 'ENABLED', totp: 'PREFERRED' });
}

// ─────────────────────────────────────────────────────────────────────────────
// Setup 2: no `as const` → wide backward-compat union
// ─────────────────────────────────────────────────────────────────────────────

declare const wide: AuthCognito;

async function widePositive() {
	// Without `as const`, arbitrary strings typecheck — backward compat.
	await wide.requireRole(ctx, 'anything');
	await wide.updateUserAttribute(ctx, 'custom:anything', 'value');
	await wide.updateUserAttribute(ctx, 'email', 'alice@example.com');
	await wide.updateMFAPreference(ctx, { sms: 'PREFERRED' });
	await wide.updateMFAPreference(ctx, { totp: 'ENABLED' });
	await wide.updateMFAPreference(ctx, { sms: 'DISABLED', totp: 'DISABLED', email: 'DISABLED' });
}

// ─────────────────────────────────────────────────────────────────────────────
// Setup 3: CognitoUser narrowing
// ─────────────────────────────────────────────────────────────────────────────

async function cognitoUserNarrowing() {
	const user = await narrow.requireAuth(ctx);
	// Groups narrow.
	const ok: boolean = user.groups.includes('admins');
	void ok;
	// Attributes narrow (read side uses ReadAttrOf<O> — prefixed form only).
	const dept: string | undefined = user.attributes['custom:department'];
	const email: string | undefined = user.attributes.email;
	void dept; void email;
	// @ts-expect-error — 'admin' (typo) is not a declared group.
	user.groups.includes('admin');
	// @ts-expect-error — 'manager' was never declared as a custom attribute.
	void user.attributes['custom:manager'];
}

// Suppress "unused" warnings — the functions are declared only for their
// type-check side effects.
void narrowPositive; void narrowNegative; void widePositive; void cognitoUserNarrowing;
void scope;
