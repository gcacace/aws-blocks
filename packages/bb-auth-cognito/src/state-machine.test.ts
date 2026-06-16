// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
	signedOut,
	confirmingSignUp,
	confirmingSignIn,
	signedIn,
	confirmingPasswordReset,
	isStandardAttribute,
	managingPasskeys,
	registeringPasskey,
} from './state-machine.js';
import type { PasskeyDescription, SignInNextStep, CognitoUser } from './types.js';
import type { AuthAction } from '@aws-blocks/auth-common';

function actionByName(actions: AuthAction[], name: string): AuthAction | undefined {
	return actions.find((a) => a.name === name);
}

// ─── isStandardAttribute ────────────────────────────────────────────────────

describe('isStandardAttribute', () => {
	test('recognizes built-in Cognito attributes', () => {
		assert.strictEqual(isStandardAttribute('email'), true);
		assert.strictEqual(isStandardAttribute('phone_number'), true);
		assert.strictEqual(isStandardAttribute('given_name'), true);
		assert.strictEqual(isStandardAttribute('family_name'), true);
		assert.strictEqual(isStandardAttribute('email_verified'), true);
	});
	test('returns false for custom attributes', () => {
		assert.strictEqual(isStandardAttribute('department'), false);
		assert.strictEqual(isStandardAttribute('employeeId'), false);
		assert.strictEqual(isStandardAttribute('custom:department'), false);
	});
});

// ─── signedOut ──────────────────────────────────────────────────────────────

describe('signedOut', () => {
	test('always emits signIn and resetPassword', () => {
		const s = signedOut({ selfSignUp: false, userAttributes: [] });
		assert.strictEqual(s.state, 'signedOut');
		assert.ok(actionByName(s.actions, 'signIn'));
		assert.ok(actionByName(s.actions, 'resetPassword'));
	});

	test('omits signUp when selfSignUp is false', () => {
		const s = signedOut({ selfSignUp: false, userAttributes: [] });
		assert.strictEqual(actionByName(s.actions, 'signUp'), undefined);
	});

	test('includes signUp when selfSignUp is true', () => {
		const s = signedOut({ selfSignUp: true, userAttributes: [], signInWith: 'username' });
		const signUp = actionByName(s.actions, 'signUp');
		assert.ok(signUp);
		assert.deepStrictEqual(
			signUp.fields.map((f) => f.name),
			['username', 'password'],
		);
	});

	test('signUp includes required user attributes as fields', () => {
		const s = signedOut({
			selfSignUp: true,
			userAttributes: [
				{ name: 'email', required: true },
				{ name: 'department', required: true, type: 'String' },
				{ name: 'optional_attr', required: false },
			],
		});
		const signUp = actionByName(s.actions, 'signUp')!;
		const fieldNames = signUp.fields.map((f) => f.name);
		assert.ok(fieldNames.includes('email'));
		assert.ok(fieldNames.includes('department'));
		assert.ok(!fieldNames.includes('optional_attr'), 'optional attrs skipped');
	});

	test('email attribute field gets type=email', () => {
		const s = signedOut({
			selfSignUp: true,
			userAttributes: [{ name: 'email', required: true }],
		});
		const emailField = actionByName(s.actions, 'signUp')!.fields.find((f) => f.name === 'email');
		assert.strictEqual(emailField!.type, 'email');
	});

	test('carries error through when provided', () => {
		const s = signedOut({ selfSignUp: false, userAttributes: [], error: 'Invalid credentials' });
		assert.strictEqual(s.error, 'Invalid credentials');
	});

	// signInWith → signUp form parity. The CDK side passes
	// `autoVerify: { email: true }` whenever signInWith includes email
	// (default `['username','email']`). Cognito then requires the email
	// attribute at SignUp; without a UI field for it users land
	// permanently UNCONFIRMED with no contact channel.
	describe('signInWith threading into signUp fields', () => {
		test('default signInWith collects email', () => {
			const s = signedOut({ selfSignUp: true, userAttributes: [] });
			const signUp = actionByName(s.actions, 'signUp')!;
			const email = signUp.fields.find((f) => f.name === 'email');
			assert.ok(email, 'default signInWith should collect email');
			assert.strictEqual(email!.type, 'email');
			assert.strictEqual(email!.required, true);
		});

		test("signInWith ['username','email'] collects email", () => {
			const s = signedOut({ selfSignUp: true, userAttributes: [], signInWith: ['username', 'email'] });
			const signUp = actionByName(s.actions, 'signUp')!;
			assert.ok(signUp.fields.find((f) => f.name === 'email'));
		});

		test("signInWith 'email' makes username field type=email and skips separate email field", () => {
			const s = signedOut({ selfSignUp: true, userAttributes: [], signInWith: 'email' });
			const signUp = actionByName(s.actions, 'signUp')!;
			const username = signUp.fields.find((f) => f.name === 'username')!;
			assert.strictEqual(username.type, 'email');
			assert.strictEqual(
				signUp.fields.filter((f) => f.name === 'email').length,
				0,
				"email-as-username pools shouldn't render a duplicate email field",
			);
		});

		test("signInWith 'username' alone does NOT collect email", () => {
			const s = signedOut({ selfSignUp: true, userAttributes: [], signInWith: 'username' });
			const signUp = actionByName(s.actions, 'signUp')!;
			assert.strictEqual(signUp.fields.find((f) => f.name === 'email'), undefined);
		});

		test("signInWith 'phone' makes username field type=tel and collects no extra phone field", () => {
			const s = signedOut({ selfSignUp: true, userAttributes: [], signInWith: 'phone' });
			const signUp = actionByName(s.actions, 'signUp')!;
			const username = signUp.fields.find((f) => f.name === 'username')!;
			assert.strictEqual(username.type, 'tel');
			assert.strictEqual(signUp.fields.find((f) => f.name === 'phone_number'), undefined);
		});

		test("signInWith ['username','email','phone'] collects both email and phone_number", () => {
			const s = signedOut({
				selfSignUp: true,
				userAttributes: [],
				signInWith: ['username', 'email', 'phone'],
			});
			const signUp = actionByName(s.actions, 'signUp')!;
			assert.ok(signUp.fields.find((f) => f.name === 'email'));
			assert.ok(signUp.fields.find((f) => f.name === 'phone_number'));
		});

		test('explicit email userAttribute does not double-render', () => {
			const s = signedOut({
				selfSignUp: true,
				userAttributes: [{ name: 'email', required: true }],
				signInWith: ['username', 'email'],
			});
			const signUp = actionByName(s.actions, 'signUp')!;
			assert.strictEqual(signUp.fields.filter((f) => f.name === 'email').length, 1);
		});

		test('signIn label and field type follow signInWith email', () => {
			const s = signedOut({ selfSignUp: true, userAttributes: [], signInWith: 'email' });
			const signIn = actionByName(s.actions, 'signIn')!;
			const username = signIn.fields.find((f) => f.name === 'username')!;
			assert.strictEqual(username.type, 'email');
		});
	});
});

// ─── confirmingSignUp ───────────────────────────────────────────────────────

describe('confirmingSignUp', () => {
	test('state + actions', () => {
		const s = confirmingSignUp('alice');
		assert.strictEqual(s.state, 'confirmingSignUp');
		assert.ok(actionByName(s.actions, 'confirmSignUp'));
		assert.ok(actionByName(s.actions, 'resendSignUpCode'));
	});

	test('username prefilled as hidden field', () => {
		const s = confirmingSignUp('alice');
		const usernameField = actionByName(s.actions, 'confirmSignUp')!.fields.find((f) => f.name === 'username')!;
		assert.strictEqual(usernameField.type, 'hidden');
		assert.strictEqual(usernameField.defaultValue, 'alice');
	});

	test('confirmSignUp has a code field', () => {
		const s = confirmingSignUp('alice');
		const codeField = actionByName(s.actions, 'confirmSignUp')!.fields.find((f) => f.name === 'code');
		assert.ok(codeField);
		assert.strictEqual(codeField!.required, true);
	});
});

// ─── confirmingSignIn (one per SignInNextStep variant) ──────────────────────

describe('confirmingSignIn', () => {
	function sessionFieldOf(state: ReturnType<typeof confirmingSignIn>) {
		const action = state.actions[0];
		return action.fields.find((f) => f.name === 'session');
	}

	test('SMS code step', () => {
		const step: SignInNextStep = {
			name: 'CONFIRM_SIGN_IN_WITH_SMS_CODE',
			session: 'sess-abc',
			codeDeliveryDetails: { destination: '+1***5678', deliveryMedium: 'SMS', attributeName: 'phone_number' },
		};
		const s = confirmingSignIn(step);
		assert.strictEqual(s.state, 'confirmingSignIn');
		const action = s.actions[0];
		assert.strictEqual(action.name, 'confirmSignIn');
		assert.match(action.label, /SMS Code/);
		assert.strictEqual(sessionFieldOf(s)!.defaultValue, 'sess-abc');
		assert.ok(action.fields.some((f) => f.name === 'code'));
	});

	test('TOTP code step', () => {
		const step: SignInNextStep = { name: 'CONFIRM_SIGN_IN_WITH_TOTP_CODE', session: 'sess-totp' };
		const s = confirmingSignIn(step);
		assert.match(s.actions[0].label, /Authenticator/);
		assert.strictEqual(sessionFieldOf(s)!.defaultValue, 'sess-totp');
	});

	test('Email code step', () => {
		const step: SignInNextStep = {
			name: 'CONFIRM_SIGN_IN_WITH_EMAIL_CODE',
			session: 'sess-email',
			codeDeliveryDetails: { destination: 'a***@e***.com', deliveryMedium: 'EMAIL', attributeName: 'email' },
		};
		const s = confirmingSignIn(step);
		assert.match(s.actions[0].label, /Email Code/);
	});

	test('MFA selection lists allowed types', () => {
		const step: SignInNextStep = {
			name: 'CONTINUE_SIGN_IN_WITH_MFA_SELECTION',
			session: 'sess-sel',
			allowedMFATypes: ['SMS', 'TOTP', 'EMAIL'],
		};
		const s = confirmingSignIn(step);
		const mfaField = s.actions[0].fields.find((f) => f.name === 'mfaType')!;
		assert.match(mfaField.label, /SMS, TOTP, EMAIL/);
	});

	test('MFA setup selection', () => {
		const step: SignInNextStep = {
			name: 'CONTINUE_SIGN_IN_WITH_MFA_SETUP_SELECTION',
			session: 'sess-setup-sel',
			allowedMFATypes: ['TOTP', 'EMAIL'],
		};
		const s = confirmingSignIn(step);
		assert.match(s.actions[0].label, /Setup/);
		const mfaField = s.actions[0].fields.find((f) => f.name === 'mfaType')!;
		assert.match(mfaField.label, /TOTP, EMAIL/);
	});

	test('TOTP setup exposes shared secret as hidden', () => {
		const step: SignInNextStep = {
			name: 'CONTINUE_SIGN_IN_WITH_TOTP_SETUP',
			session: 'sess-totp-setup',
			sharedSecret: 'JBSWY3DPEHPK3PXP',
		};
		const s = confirmingSignIn(step);
		const secretField = s.actions[0].fields.find((f) => f.name === 'sharedSecret')!;
		assert.strictEqual(secretField.type, 'hidden');
		assert.strictEqual(secretField.defaultValue, 'JBSWY3DPEHPK3PXP');
		assert.ok(s.actions[0].fields.some((f) => f.name === 'code'));
	});

	test('Email setup asks for address, not code', () => {
		const step: SignInNextStep = { name: 'CONTINUE_SIGN_IN_WITH_EMAIL_SETUP', session: 'sess-email-setup' };
		const s = confirmingSignIn(step);
		assert.match(s.actions[0].label, /Email OTP/);
		const emailField = s.actions[0].fields.find((f) => f.name === 'email');
		assert.ok(emailField, 'email address field present');
		assert.strictEqual(emailField!.type, 'email');
		// First-step email-setup must not expose a code field — the code is
		// requested only after the user submits an address and Cognito emits
		// the follow-up CONFIRM_SIGN_IN_WITH_EMAIL_CODE challenge.
		assert.ok(!s.actions[0].fields.some((f) => f.name === 'code'));
	});

	test('USER_AUTH first-factor selection lists available challenges', () => {
		const step: SignInNextStep = {
			name: 'CONTINUE_SIGN_IN_WITH_FIRST_FACTOR_SELECTION',
			session: 'sess-ffs',
			availableChallenges: ['PASSWORD', 'EMAIL_OTP'],
		};
		const s = confirmingSignIn(step);
		assert.match(s.actions[0].label, /Sign-In Method/);
		const pickField = s.actions[0].fields.find((f) => f.name === 'firstFactor')!;
		assert.match(pickField.label, /PASSWORD, EMAIL_OTP/);
	});

	test('USER_AUTH password leg asks for a password', () => {
		const step: SignInNextStep = { name: 'CONFIRM_SIGN_IN_WITH_PASSWORD', session: 'sess-pw' };
		const s = confirmingSignIn(step);
		assert.match(s.actions[0].label, /Password/);
		const pw = s.actions[0].fields.find((f) => f.name === 'password')!;
		assert.strictEqual(pw.type, 'password');
	});

	test('USER_AUTH first-factor email OTP asks for a code', () => {
		const step: SignInNextStep = {
			name: 'CONFIRM_SIGN_IN_WITH_FIRST_FACTOR_EMAIL_OTP',
			session: 'sess-ffe',
			codeDeliveryDetails: { destination: 'a***@e***.com', deliveryMedium: 'EMAIL', attributeName: 'email' },
		};
		const s = confirmingSignIn(step);
		assert.match(s.actions[0].label, /Email Code/);
		assert.ok(s.actions[0].fields.some((f) => f.name === 'code'));
	});

	test('USER_AUTH first-factor SMS OTP asks for a code', () => {
		const step: SignInNextStep = {
			name: 'CONFIRM_SIGN_IN_WITH_FIRST_FACTOR_SMS_OTP',
			session: 'sess-ffs-sms',
			codeDeliveryDetails: { destination: '+1***5678', deliveryMedium: 'SMS', attributeName: 'phone_number' },
		};
		const s = confirmingSignIn(step);
		assert.match(s.actions[0].label, /SMS Code/);
	});

	test('NEW_PASSWORD_REQUIRED has a newPassword field', () => {
		const step: SignInNextStep = {
			name: 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED',
			session: 'sess-np',
		};
		const s = confirmingSignIn(step);
		assert.match(s.actions[0].label, /New Password/);
		assert.ok(s.actions[0].fields.some((f) => f.name === 'newPassword'));
	});

	test('RESET_PASSWORD routes back to resetPassword action', () => {
		const step: SignInNextStep = { name: 'RESET_PASSWORD' };
		const s = confirmingSignIn(step);
		assert.strictEqual(s.actions[0].name, 'resetPassword');
	});

	test('CONFIRM_SIGN_UP routes back to confirmSignUp action', () => {
		const step: SignInNextStep = { name: 'CONFIRM_SIGN_UP' };
		const s = confirmingSignIn(step);
		assert.strictEqual(s.actions[0].name, 'confirmSignUp');
	});

	test('carries error through', () => {
		const step: SignInNextStep = { name: 'CONFIRM_SIGN_IN_WITH_TOTP_CODE', session: 's' };
		const s = confirmingSignIn(step, 'Code mismatch');
		assert.strictEqual(s.error, 'Code mismatch');
	});
});

// ─── signedIn ───────────────────────────────────────────────────────────────

describe('signedIn', () => {
	test('carries user + sign-out action', () => {
		const user: CognitoUser = { userId: 'alice', username: 'alice', userSub: 'sub-1', groups: [], attributes: {} };
		const s = signedIn(user);
		assert.strictEqual(s.state, 'signedIn');
		assert.deepStrictEqual(s.user, user);
		assert.strictEqual(s.actions.length, 1);
		assert.strictEqual(s.actions[0].name, 'signOut');
	});
});

// ─── confirmingPasswordReset ────────────────────────────────────────────────

describe('confirmingPasswordReset', () => {
	test('emits confirmResetPassword with username prefilled', () => {
		const s = confirmingPasswordReset('alice');
		assert.strictEqual(s.state, 'confirmingPasswordReset');
		const action = s.actions[0];
		assert.strictEqual(action.name, 'confirmResetPassword');
		const usernameField = action.fields.find((f) => f.name === 'username')!;
		assert.strictEqual(usernameField.type, 'hidden');
		assert.strictEqual(usernameField.defaultValue, 'alice');
		assert.ok(action.fields.some((f) => f.name === 'code'));
		assert.ok(action.fields.some((f) => f.name === 'newPassword'));
	});
});

// ─── Passkeys ─────────────────────────────────────────────────────────────

describe('signedOut + enablePasskeys', () => {
	test('omits signInWithPasskey when not enabled', () => {
		const s = signedOut({ selfSignUp: true, userAttributes: [] });
		assert.strictEqual(actionByName(s.actions, 'signInWithPasskey'), undefined);
	});

	test('adds a username-only signInWithPasskey button when enabled', () => {
		const s = signedOut({ selfSignUp: true, userAttributes: [], enablePasskeys: true });
		const action = actionByName(s.actions, 'signInWithPasskey');
		assert.ok(action);
		assert.deepStrictEqual(
			action.fields.map((f) => f.name),
			['username'],
		);
	});
});

describe('signedIn + enablePasskeys', () => {
	const user: CognitoUser = { userId: 'alice', username: 'alice', userSub: 'sub-1', groups: [], attributes: {} };

	test('omits passkey actions by default', () => {
		const s = signedIn(user);
		assert.strictEqual(actionByName(s.actions, 'startPasskeyRegistration'), undefined);
		assert.strictEqual(actionByName(s.actions, 'listPasskeys'), undefined);
	});

	test('adds register + manage actions when enabled', () => {
		const s = signedIn(user, { enablePasskeys: true });
		assert.ok(actionByName(s.actions, 'startPasskeyRegistration'));
		assert.ok(actionByName(s.actions, 'listPasskeys'));
	});
});

describe('confirmingSignIn — CONFIRM_SIGN_IN_WITH_WEB_AUTHN', () => {
	test('emits a webauthn-get capability action with credential request options', () => {
		const ns: SignInNextStep = {
			name: 'CONFIRM_SIGN_IN_WITH_WEB_AUTHN',
			session: 'sess-1',
			credentialRequestOptions: '{"challenge":"abc","rpId":"localhost"}',
		};
		const s = confirmingSignIn(ns);
		assert.strictEqual(s.state, 'confirmingSignIn');
		const a = s.actions[0];
		assert.strictEqual(a.name, 'confirmSignIn');
		assert.strictEqual(a.capability, 'webauthn-get');
		const opts = a.fields.find((f) => f.name === 'credentialRequestOptions')!;
		assert.strictEqual(opts.type, 'hidden');
		assert.strictEqual(opts.defaultValue, '{"challenge":"abc","rpId":"localhost"}');
		assert.ok(a.fields.some((f) => f.name === 'credential' && f.type === 'hidden'));
		const challengeField = a.fields.find((f) => f.name === 'challenge')!;
		assert.strictEqual(challengeField.defaultValue, 'webauthn');
	});
});

describe('registeringPasskey', () => {
	test('emits a webauthn-create capability action carrying the options blob', () => {
		const user: CognitoUser = { userId: 'alice', username: 'alice', userSub: 'sub-1', groups: [], attributes: {} };
		const s = registeringPasskey(user, '{"challenge":"abc"}');
		assert.strictEqual(s.state, 'signedIn');
		const a = s.actions[0];
		assert.strictEqual(a.name, 'completePasskeyRegistration');
		assert.strictEqual(a.capability, 'webauthn-create');
		const opts = a.fields.find((f) => f.name === 'credentialCreationOptions')!;
		assert.strictEqual(opts.defaultValue, '{"challenge":"abc"}');
	});
});

describe('managingPasskeys', () => {
	const user: CognitoUser = { userId: 'alice', username: 'alice', userSub: 'sub-1', groups: [], attributes: {} };

	test('renders one delete-by-id button per passkey + register + signOut', () => {
		const passkeys: PasskeyDescription[] = [
			{ credentialId: 'cred-1', friendlyName: 'iPhone', createdAt: 1 },
			{ credentialId: 'cred-2', createdAt: 2 },
		];
		const s = managingPasskeys(user, passkeys);
		const deletes = s.actions.filter((a) => a.name === 'deletePasskey');
		assert.strictEqual(deletes.length, 2);
		assert.strictEqual(deletes[0].fields[0].defaultValue, 'cred-1');
		assert.strictEqual(deletes[1].fields[0].defaultValue, 'cred-2');
		assert.ok(actionByName(s.actions, 'startPasskeyRegistration'));
		assert.ok(actionByName(s.actions, 'signOut'));
	});

	test('shows a fallback delete label when friendlyName is missing', () => {
		const passkeys: PasskeyDescription[] = [{ credentialId: 'abcdef0123456789', createdAt: 1 }];
		const s = managingPasskeys(user, passkeys);
		const del = s.actions.find((a) => a.name === 'deletePasskey')!;
		assert.match(del.label, /abcdef01/);
	});
});
