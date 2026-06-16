/**
 * End-to-end test for the auth-cognito demo template's passwordless flow.
 *
 * Mirrors the exact AuthCognito config the template ships in
 * `packages/create-blocks-app/templates/auth-cognito/aws-blocks/index.ts`
 * (passwordless email-OTP via USER_AUTH + EMAIL_OTP, signInWith email,
 * MFA off, autoSignIn after sign-up).
 *
 * Drives `auth.createApi()`'s `getAuthState` / `setAuthState` — the same
 * surface the browser `<Authenticator>` calls. So if these tests pass,
 * the form-renderer over them works too (the renderer is a generic
 * field-rendering pass; nothing flow-specific lives there).
 */

import { describe, test } from 'node:test';
import assert from 'node:assert';
import type { BlocksContext } from '@aws-blocks/core';
import { Scope } from '@aws-blocks/core';
import type { AuthActionInput, AuthState, AuthStateApi } from '@aws-blocks/auth-common';
import { AuthCognito } from './index.js';

function ctx(): BlocksContext {
	return {
		request: { headers: new Headers() },
		response: { headers: new Headers() },
	} as unknown as BlocksContext;
}

/**
 * Mimic a browser's cookie store: carry the prior request's inbound cookies
 * forward AND apply any Set-Cookie headers from the prior response on top
 * (replacing same-name cookies, clearing those with `Max-Age=0`).
 *
 * A naïve roll that only forwards Set-Cookie headers is wrong — the
 * browser keeps cookies the server *didn't* re-emit, and the
 * `confirmSignUp` step deliberately doesn't re-emit the bridging cookie
 * because it's still valid from the prior response. Dropping the cookie
 * when re-rolling there is what produced "No autoSignIn flow in progress"
 * during initial test runs.
 */
function roll(prev: BlocksContext): BlocksContext {
	const next = ctx();

	// Start from whatever the prior request was carrying.
	const jar = new Map<string, string>();
	const prior = (prev as any).request.headers.get('cookie') as string | null;
	if (prior) {
		for (const part of prior.split(/;\s*/)) {
			const eq = part.indexOf('=');
			if (eq > 0) jar.set(part.slice(0, eq), part.slice(eq + 1));
		}
	}

	// Apply Set-Cookie deltas from the prior response. Node 20+
	// `getSetCookie()` returns each header as a discrete string. The mock
	// emits multiple cookies (long-lived session + short-lived autoSignIn
	// bridge); we have to keep them distinct.
	const setCookies: string[] = (prev as any).response.headers.getSetCookie?.() ?? [];
	for (const raw of setCookies) {
		const [pair, ...attrs] = raw.split(';').map((s) => s.trim());
		if (!pair) continue;
		const eq = pair.indexOf('=');
		if (eq < 0) continue;
		const name = pair.slice(0, eq);
		const value = pair.slice(eq + 1);
		const cleared = attrs.some((a) => /^max-age\s*=\s*0$/i.test(a));
		if (cleared) jar.delete(name);
		else jar.set(name, value);
	}

	if (jar.size > 0) {
		(next as any).request.headers.set(
			'cookie',
			[...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; '),
		);
	}
	return next;
}

let counter = 0;
function nextId(tag: string): string {
	return `${tag}-${++counter}-${Math.random().toString(36).slice(2, 6)}`;
}

interface DemoFixture {
	auth: AuthCognito<any>;
	/** Bind the namespace handler to a context, returning the typed API. */
	authApi: (c: BlocksContext) => AuthStateApi;
	lastCode: () => { username: string; code: string; purpose: string } | null;
}

/** Same options as the demo template's `aws-blocks/index.ts`. */
function makeDemoAuth(id: string): DemoFixture {
	const scope = new Scope(`passwordless-demo-${id}`);
	let lastCode: { username: string; code: string; purpose: string } | null = null;
	const auth = new AuthCognito(scope, 'auth', {
		passwordPolicy: { minLength: 8, requireDigits: true },
		signInWith: 'email' as const,
		authFlowType: 'USER_AUTH' as const,
		preferredChallenge: 'EMAIL_OTP' as const,
		userAttributes: [
			{ name: 'department', required: false },
		] as const,
		groups: ['editors', 'readers'] as const,
		mfa: 'off' as const,
		selfSignUp: true,
		codeDelivery: async (username, code, purpose) => {
			lastCode = { username, code, purpose };
		},
	});
	const handler = auth.createApi() as unknown as (c: BlocksContext) => AuthStateApi;
	return { auth, authApi: handler, lastCode: () => lastCode };
}

describe('auth-cognito demo (passwordless USER_AUTH + EMAIL_OTP)', () => {
	test('signed-out → signUp → confirmSignUp → autoSignIn → signed in', async () => {
		const { authApi, lastCode } = makeDemoAuth(nextId('signup'));
		const email = 'demo1@test.example';

		// 1. Initial render — signed out, signUp action available.
		const startCtx = ctx();
		const start: AuthState = await authApi(startCtx).getAuthState();
		assert.strictEqual(start.state, 'signedOut');
		const signUpAction = start.actions?.find((a) => a.name === 'signUp');
		assert.ok(signUpAction, 'signUp action should be offered when selfSignUp is enabled');

		// 2. Submit sign-up form. With `signInWith: 'email'` the username
		// field IS the email — no separate field. The mock mirrors Cognito
		// by synthesising `email = username` and flipping
		// `email_verified=true` on confirmSignUp (see
		// `usernameAliasAttr()`).
		const signUpCtx = ctx();
		const r1 = await authApi(signUpCtx).setAuthState({
			action: 'signUp',
			username: email,
			password: 'Password1!',
		} as AuthActionInput);
		assert.strictEqual(r1.state, 'confirmingSignUp');
		const code1 = lastCode();
		assert.ok(code1, 'codeDelivery should fire on sign-up');
		assert.strictEqual(code1!.purpose, 'signUp');

		// 3. Submit confirm-code form. Carrying the autoSignIn cookie forward.
		const confirmCtx = roll(signUpCtx);
		const r2 = await authApi(confirmCtx).setAuthState({
			action: 'confirmSignUp',
			username: email,
			code: code1!.code,
		} as AuthActionInput);
		// The state machine returns `state: 'confirmingSignUp'` with a single
		// `autoSignIn` "Continue" action. The browser auto-clicks it.
		assert.strictEqual(r2.state, 'confirmingSignUp');
		assert.strictEqual(r2.actions?.length, 1);
		assert.strictEqual(r2.actions?.[0]?.name, 'autoSignIn');

		// 4. The "Continue" auto-sign-in step exchanges the bridging session.
		const autoCtx = roll(confirmCtx);
		const r3 = await authApi(autoCtx).setAuthState({
			action: 'autoSignIn',
			username: email,
		} as AuthActionInput);
		assert.strictEqual(r3.state, 'signedIn', `expected signedIn, got ${r3.state} (${(r3 as any).error ?? ''})`);
		if (r3.state !== 'signedIn') return;
		assert.ok(r3.user, 'user should be present in signedIn state');
		assert.strictEqual(r3.user!.username, email);
	});

	test('returning user: signIn → EMAIL_OTP code → signed in (no password prompt)', async () => {
		const { auth, authApi, lastCode } = makeDemoAuth(nextId('signin'));
		const email = 'demo2@test.example';

		// Pre-provision the user (sign-up + confirm) so we can exercise the
		// *return-user* branch. No explicit `email` attribute needed: the
		// mock synthesises it from the username (signInWith: 'email').
		await auth.signUp(email, 'Password1!', { attributes: {} });
		const signUpCode = lastCode();
		assert.ok(signUpCode);
		await auth.confirmSignUp(email, signUpCode!.code);

		// 1. Click "Sign In" with email only — preferredChallenge is EMAIL_OTP.
		const signInCtx = ctx();
		const r1 = await authApi(signInCtx).setAuthState({
			action: 'signIn',
			username: email,
			password: '', // USER_AUTH + EMAIL_OTP doesn't require a password
		} as AuthActionInput);
		assert.strictEqual(r1.state, 'confirmingSignIn', `expected confirmingSignIn, got ${r1.state} (${(r1 as any).error ?? ''})`);
		if (r1.state !== 'confirmingSignIn') return;
		const action = r1.actions?.[0];
		assert.ok(action);
		// The state machine emits a confirmSignIn action carrying a `session`
		// hidden field and a `code` text field — exactly what the renderer
		// puts on screen.
		const sessionField = action!.fields.find((f) => f.name === 'session');
		assert.ok(sessionField, 'session hidden field should be present');
		assert.strictEqual(sessionField!.type, 'hidden');
		const codeField = action!.fields.find((f) => f.name === 'code');
		assert.ok(codeField, 'code text field should be present');

		const otp = lastCode();
		assert.ok(otp, 'codeDelivery should fire for EMAIL_OTP first factor');
		// First-factor EMAIL_OTP rides the same delivery channel as MFA codes,
		// so the BB tags it with the `mfa` purpose. Cognito does the same.
		assert.strictEqual(otp!.purpose, 'mfa');

		// 2. Submit the OTP through the form's discriminated payload.
		const confirmCtx = roll(signInCtx);
		const r2 = await authApi(confirmCtx).setAuthState({
			action: 'confirmSignIn',
			challenge: 'code',
			session: (sessionField as any).defaultValue as string,
			code: otp!.code,
		} as AuthActionInput);
		assert.strictEqual(r2.state, 'signedIn', `expected signedIn, got ${r2.state} (${(r2 as any).error ?? ''})`);
		if (r2.state !== 'signedIn') return;
		assert.ok(r2.user, 'user should be present in signedIn state');
		assert.strictEqual(r2.user!.username, email);
	});

	test('signed-out form offers the expected action set for the demo config', async () => {
		// Locks in the action vocabulary the renderer sees on the home screen
		// for `selfSignUp: true` + `signInWith: 'email'`. If the auth-common
		// state machine ever changes the default offering, this test catches
		// it before the demo regresses silently.
		const { authApi } = makeDemoAuth(nextId('shape'));
		const start = await authApi(ctx()).getAuthState();
		assert.strictEqual(start.state, 'signedOut');
		const names = (start.actions ?? []).map((a) => a.name).sort();
		assert.deepStrictEqual(names, ['resetPassword', 'signIn', 'signUp']);
	});
});

// ─── Default signInWith (['username','email']) — bug-bash regression guard ──
//
// Round 5 of the AWS Blocks bug bash discovered that 3/3 Cognito apps left
// users permanently UNCONFIRMED in production: the pool's
// `AutoVerifiedAttributes: ['email']` (set by the CDK construct whenever
// `signInWith` includes email) requires an email attribute at SignUp, but
// the Authenticator's signUp form never collected one. This scenario locks
// in the fix end-to-end: the descriptor surfaces an `email` field, the
// form-style submission round-trips it, and the confirmed user has the
// `email` attribute populated.

function makeDefaultAuth(id: string): DemoFixture {
	const scope = new Scope(`default-signinwith-${id}`);
	let lastCode: { username: string; code: string; purpose: string } | null = null;
	const auth = new AuthCognito(scope, 'auth', {
		passwordPolicy: { minLength: 8, requireDigits: true },
		// Default signInWith is ['username','email']. That's the historical
		// AuthCognito default and what the bug-bash apps shipped.
		mfa: 'off' as const,
		selfSignUp: true,
		codeDelivery: async (username, code, purpose) => {
			lastCode = { username, code, purpose };
		},
	});
	const handler = auth.createApi() as unknown as (c: BlocksContext) => AuthStateApi;
	return { auth, authApi: handler, lastCode: () => lastCode };
}

describe('default signInWith — auto-collects email at sign-up', () => {
	test('signUp action includes a required email field', async () => {
		const { authApi } = makeDefaultAuth(nextId('default-shape'));
		const start = await authApi(ctx()).getAuthState();
		assert.strictEqual(start.state, 'signedOut');
		const signUp = start.actions?.find((a) => a.name === 'signUp');
		assert.ok(signUp, 'signUp action should be present');
		const email = signUp!.fields.find((f) => f.name === 'email');
		assert.ok(email, 'email field should be auto-injected for default signInWith');
		assert.strictEqual(email!.required, true);
		assert.strictEqual(email!.type, 'email');
	});

	test('form submit with email lands as a Cognito attribute on the user', async () => {
		const { auth, authApi, lastCode } = makeDefaultAuth(nextId('default-flow'));
		const username = 'alice';
		const email = 'alice@example.com';

		// 1. Submit signUp the way the renderer does — username + password +
		// auto-injected email field.
		const signUpCtx = ctx();
		const r1 = await authApi(signUpCtx).setAuthState({
			action: 'signUp',
			username,
			password: 'Password1!',
			email,
		} as AuthActionInput);
		assert.strictEqual(r1.state, 'confirmingSignUp');

		// 2. Confirm with the emitted code.
		const code = lastCode();
		assert.ok(code);
		await auth.confirmSignUp(username, code!.code);

		// 3. The mock now mirrors AWS: the confirmed user record has the
		// email attribute the form submitted, and email_verified is true
		// (because the user proved possession via the OTP). If the descriptor
		// had omitted the email field, the attribute would be missing here —
		// which is the production bug Round 5 caught. Sign in then read
		// attributes through the public surface to verify.
		const signInCtx = ctx();
		const r2 = await authApi(signInCtx).setAuthState({
			action: 'signIn',
			username,
			password: 'Password1!',
		} as AuthActionInput);
		assert.strictEqual(r2.state, 'signedIn', `expected signedIn, got ${r2.state} (${(r2 as any).error ?? ''})`);
		if (r2.state !== 'signedIn') return;
		// `fetchUserAttributes` reads the session cookie set on the prior
		// response — `roll()` propagates Set-Cookie → next request's Cookie
		// header.
		const readCtx = roll(signInCtx);
		const attrs = await auth.fetchUserAttributes(readCtx);
		assert.strictEqual(attrs.email, email);
		assert.strictEqual(attrs.email_verified, 'true');
	});
});
