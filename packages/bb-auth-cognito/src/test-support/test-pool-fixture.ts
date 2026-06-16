// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * One-off Cognito User Pool fixture for integration tests. Provisions pool +
 * client via `@aws-sdk/client-cognito-identity-provider` so the integration
 * test file can exercise real Cognito without touching the CDK construct or
 * a deployed stack.
 *
 * Delivery modes (pick via `opts.delivery`):
 *
 *   1. `'custom-sender'` (default for this fixture) — attaches a custom
 *      SMS/Email Sender Lambda via `LambdaConfig` + `KMSKeyID`. The Lambda
 *      decrypts Cognito's KMS-encrypted code claim and writes it to a
 *      DynamoDB table the test reads via `captureCode()`. End-to-end code
 *      verification against real Cognito, no SNS/SES delivery required —
 *      the sender Lambda **replaces** Cognito's default senders, so this
 *      mode is test-only (a prod pool with a sender Lambda would stop
 *      delivering codes to users). See `custom-sender-harness.ts`.
 *
 *   2. `'customer-ses-sns'` — pool uses Cognito's built-in senders +
 *      optional customer-brought-their-own SES identity / SNS role. Matches
 *      the config most customers ship with, but tests can only assert
 *      challenge shape + wrong-code rejection (the harness can't read the
 *      delivered SMS/email). Kept as a regression guard — the BB must not
 *      fight a customer's SES/SNS setup.
 *
 * Environment variables:
 *   - `BLOCKS_INTEGRATION=1`                required — tests skip without it.
 *   - `AWS_PROFILE` / `AWS_REGION`       standard SDK resolution.
 *   - `BLOCKS_INTEGRATION_REGION`           optional override (default: us-east-1).
 *   - `BLOCKS_INTEGRATION_SES_FROM`         only for `delivery: 'customer-ses-sns'`
 *                                        with `emailMfa: true`.
 *   - `BLOCKS_INTEGRATION_SNS_ROLE_ARN`     only for `delivery: 'customer-ses-sns'`
 *                                        with `smsMfa: true`.
 */
import {
	AdminCreateUserCommand,
	AdminDeleteUserCommand,
	AdminSetUserMFAPreferenceCommand,
	AdminSetUserPasswordCommand,
	AdminUpdateUserAttributesCommand,
	AssociateSoftwareTokenCommand,
	CognitoIdentityProviderClient,
	CreateUserPoolClientCommand,
	CreateUserPoolCommand,
	DeleteUserPoolCommand,
	DeleteUserPoolClientCommand,
	VerifySoftwareTokenCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import {
	AttachRolePolicyCommand,
	CreateRoleCommand,
	DeleteRoleCommand,
	DeleteRolePolicyCommand,
	DetachRolePolicyCommand,
	IAMClient,
	PutRolePolicyCommand,
} from '@aws-sdk/client-iam';
import { SESClient, ListIdentitiesCommand, GetIdentityVerificationAttributesCommand } from '@aws-sdk/client-ses';
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import { setTimeout as sleep } from 'node:timers/promises';

export interface TestPoolOptions {
	/** Short test-run identifier (used in pool name). Default: random. */
	nameSuffix?: string;
	/** Enable TOTP MFA on the pool. Default: true. */
	totpMfa?: boolean;
	/** Enable EMAIL MFA on the pool. */
	emailMfa?: boolean;
	/** Enable SMS MFA on the pool. */
	smsMfa?: boolean;
	/** MFA enforcement mode. Default: `'OPTIONAL'`. */
	mfaEnforcement?: 'OFF' | 'ON' | 'OPTIONAL';
	/** Enable USER_AUTH (choice-based) flow on the UserPoolClient. Default: false. */
	userAuth?: boolean;
	/**
	 * Pool allows self sign-up (`cognito-idp:SignUp`). Default: false.
	 * Turning this on in `custom-sender` mode also force-wires SES so
	 * signup/forgot-password codes flow through the capture Lambda just
	 * like MFA codes. Cognito's validator requires a verified SES identity
	 * for signup-code delivery via `EmailSendingAccount: 'DEVELOPER'`; the
	 * custom sender replaces actual delivery but the pool-level config
	 * still has to pass.
	 */
	selfSignUp?: boolean;
	/**
	 * How the pool delivers SMS / Email codes.
	 *
	 *  - `'custom-sender'` (default) — attach a capture Lambda + KMS key so
	 *    tests can read the real codes. Requires no SNS/SES setup; the
	 *    Lambda swallows deliveries.
	 *  - `'customer-ses-sns'` — use Cognito's default senders backed by
	 *    whatever SES/SNS identities the operator brings via
	 *    `BLOCKS_INTEGRATION_SES_FROM` / `BLOCKS_INTEGRATION_SNS_ROLE_ARN`.
	 *    Matches the config customers ship with but tests can only assert
	 *    challenge shape — the codes leave via real channels the harness
	 *    can't read.
	 */
	delivery?: 'custom-sender' | 'customer-ses-sns';
	/**
	 * Pool identifier shape, mirroring the BB option of the same name.
	 * Default `'email'` matches what the fixture has historically
	 * synthesized (Cognito `UsernameAttributes: ['email']` — email-as-
	 * username). Setting `'username'` switches to a username-only pool;
	 * `['username', 'email']` to the default BB shape (`AliasAttributes:
	 * ['email']`).
	 *
	 * Test files exercising the alias-mode shape (where `SignUp` rejects
	 * email values in the username field) should pass
	 * `signInWith: ['username', 'email']`. Single-string values are
	 * accepted for ergonomics.
	 */
	signInWith?: 'username' | 'email' | 'phone' | ('username' | 'email' | 'phone')[];
}

export interface TestPool {
	client: CognitoIdentityProviderClient;
	userPoolId: string;
	userPoolClientId: string;
	region: string;
	cleanup: () => Promise<void>;
	/**
	 * Populated only when `delivery: 'custom-sender'` (default). Call
	 * `captureCode(username, purpose)` after triggering a flow that emits
	 * an OTP to read back the decrypted code the sender Lambda captured.
	 * See `custom-sender-harness.ts` for the purpose taxonomy.
	 */
	captureCode?: (username: string, purpose: string, timeoutMs?: number) => Promise<string>;
}

/**
 * Provision a one-off Cognito User Pool for an integration test. Returns a
 * handle with the pool/client IDs and a `cleanup` function that deletes
 * both — always call it in `afterAll` even on failure (use try/finally).
 */
export async function setupTestPool(opts: TestPoolOptions = {}): Promise<TestPool> {
	const region = process.env.BLOCKS_INTEGRATION_REGION ?? process.env.AWS_REGION ?? 'us-east-1';
	const client = new CognitoIdentityProviderClient({ region });
	const suffix = opts.nameSuffix ?? Math.random().toString(36).slice(2, 8);
	const poolName = `blocks-auth-itest-${suffix}`;

	const mfaEnforcement = opts.mfaEnforcement ?? 'OPTIONAL';
	const delivery = opts.delivery ?? 'custom-sender';
	// `EnabledMfas` may only be populated when MfaConfiguration is not OFF.
	// We still need the pool-level SmsConfiguration/EmailConfiguration even
	// for MFA-off pools (USER_AUTH passwordless flows want SMS_OTP /
	// EMAIL_OTP delivery), so `opts.smsMfa` / `opts.emailMfa` govern the
	// pool-wide config separately from the MFA allow-list.
	const enabledMfas: ('SOFTWARE_TOKEN_MFA' | 'SMS_MFA' | 'EMAIL_OTP')[] = [];
	if (mfaEnforcement !== 'OFF') {
		if (opts.totpMfa !== false) enabledMfas.push('SOFTWARE_TOKEN_MFA');
		if (opts.emailMfa) enabledMfas.push('EMAIL_OTP');
		if (opts.smsMfa) enabledMfas.push('SMS_MFA');
	}

	// Cognito's pool validators require `SmsConfiguration` + `EmailConfiguration`
	// to EXIST on the pool when SMS MFA / Email MFA are in `EnabledMfas` —
	// even when a custom SMS/Email sender Lambda is wired to replace actual
	// delivery. In `custom-sender` mode we provision throwaway dummies (an
	// IAM role Cognito can assume for SNS publishing but never actually
	// does; a pre-existing verified SES identity) purely to make the
	// validator happy. The sender Lambda intercepts the code before any
	// SNS / SES call fires.
	//
	// For `customer-ses-sns` mode, the caller supplies the real SES/SNS
	// config via env vars — we fail loudly if missing.
	let snsCallerArn: string | undefined;
	let sesSourceArn: string | undefined;
	let sesFromAddress: string | undefined;
	const dummySnsRoleName = `blocks-itest-sns-${suffix}`;
	const iam = new IAMClient({ region });
	const sts = new STSClient({ region });
	const ses = new SESClient({ region });
	const accountId = (await sts.send(new GetCallerIdentityCommand({}))).Account!;

	// Rollback stack for anything provisioned before `CreateUserPool` returns.
	const preCreationRollback: Array<() => Promise<void>> = [];

	if (opts.smsMfa) {
		if (delivery === 'customer-ses-sns') {
			if (!process.env.BLOCKS_INTEGRATION_SNS_ROLE_ARN) {
				throw new Error(
					'setupTestPool({ delivery: "customer-ses-sns", smsMfa: true }) requires BLOCKS_INTEGRATION_SNS_ROLE_ARN.',
				);
			}
			snsCallerArn = process.env.BLOCKS_INTEGRATION_SNS_ROLE_ARN;
		} else {
			// Provision a dummy SNS caller role. Trust policy: cognito-idp
			// can assume with the matching ExternalId. Inline policy: SNS
			// Publish (never actually called — custom sender intercepts).
			await iam.send(new CreateRoleCommand({
				RoleName: dummySnsRoleName,
				AssumeRolePolicyDocument: JSON.stringify({
					Version: '2012-10-17',
					Statement: [{
						Effect: 'Allow',
						Principal: { Service: 'cognito-idp.amazonaws.com' },
						Action: 'sts:AssumeRole',
						Condition: { StringEquals: { 'sts:ExternalId': `blocks-itest-${suffix}` } },
					}],
				}),
				Description: 'blocks-auth-cognito integration test SNS role (sender Lambda intercepts delivery)',
			}));
			preCreationRollback.push(async () => {
				try { await iam.send(new DeleteRolePolicyCommand({ RoleName: dummySnsRoleName, PolicyName: 'sns-publish' })); } catch {}
				try { await iam.send(new DeleteRoleCommand({ RoleName: dummySnsRoleName })); } catch {}
			});
			await iam.send(new PutRolePolicyCommand({
				RoleName: dummySnsRoleName,
				PolicyName: 'sns-publish',
				PolicyDocument: JSON.stringify({
					Version: '2012-10-17',
					Statement: [{ Effect: 'Allow', Action: 'sns:Publish', Resource: '*' }],
				}),
			}));
			// IAM eventual consistency — Cognito can't assume the role for
			// several seconds (sometimes 20+) after role creation + policy
			// attachment. Cognito validates the trust relationship
			// synchronously at CreateUserPool time, so a race here manifests
			// as `InvalidSmsRoleTrustRelationshipException`.
			await sleep(30_000);
			snsCallerArn = `arn:aws:iam::${accountId}:role/${dummySnsRoleName}`;
		}
	}

	// `selfSignUp` implies we need SES wired so Cognito accepts the
	// signup/forgot-password code-delivery path. The custom sender
	// intercepts actual delivery.
	const needSes = opts.emailMfa || opts.selfSignUp;
	if (needSes) {
		const explicit = process.env.BLOCKS_INTEGRATION_SES_FROM;
		if (explicit) {
			sesSourceArn = explicit;
		} else {
			// Auto-discover a verified SES identity in the calling account.
			// Cognito's `EmailConfiguration.SourceArn` just needs any
			// verified identity — the custom sender replaces actual
			// delivery, so we only need the validator to pass.
			const identities = await ses.send(new ListIdentitiesCommand({ MaxItems: 20 }));
			const candidates = identities.Identities ?? [];
			if (candidates.length === 0) {
				throw new Error(
					'setupTestPool({ emailMfa: true }) needs a verified SES identity. '
					+ 'Either verify one in the calling account, or set BLOCKS_INTEGRATION_SES_FROM to the ARN of one.',
				);
			}
			const verifyResp = await ses.send(new GetIdentityVerificationAttributesCommand({ Identities: candidates }));
			const verified = candidates.filter(
				(id) => verifyResp.VerificationAttributes?.[id]?.VerificationStatus === 'Success',
			);
			if (verified.length === 0) {
				throw new Error(
					'setupTestPool({ emailMfa: true }) found SES identities but none are verified. '
					+ `Candidates: ${candidates.join(', ')}`,
				);
			}
			// Prefer a domain identity over an email identity — Cognito's
			// SES validator is picky about email-address identities when
			// the user pool's From header format varies. Domain identities
			// always satisfy the validator.
			const domain = verified.find((id) => !id.includes('@'));
			const chosen = domain ?? verified[0]!;
			sesSourceArn = `arn:aws:ses:${region}:${accountId}:identity/${chosen}`;
			// Cognito also wants an explicit From address. For a domain
			// identity we synthesize `no-reply@<domain>`; for an email
			// identity the identity itself IS the From address.
			sesFromAddress = chosen.includes('@') ? chosen : `no-reply@${chosen}`;
		}
	}

	// Pool starts with MFA=OFF so CreateUserPool validators don't require
	// EnabledMfas to match the SMS/Email configs (chicken-and-egg vs. the
	// custom sender that's attached AFTER pool creation). `applyMfaConfig`
	// enables MFA later.
	const createMfaConfig = 'OFF';

	let createdPool;
	try {
		// Resolve `signInWith` to the right Cognito-API alias shape.
		// `UsernameAttributes` (email-as-username / phone-as-username)
		// and `AliasAttributes` (username + email/phone alias) are
		// mutually exclusive on `CreateUserPool`.
		const signInList = (() => {
			const v = opts.signInWith ?? 'email';
			return Array.isArray(v) ? v : [v];
		})();
		const aliasMode = signInList.includes('username') && signInList.length > 1;
		const usernameAttrs = !aliasMode
			? signInList.map((v) => v === 'phone' ? 'phone_number' : v).filter((v) => v !== 'username')
			: undefined;
		const aliasAttrs = aliasMode
			? signInList.filter((v) => v !== 'username').map((v) => v === 'phone' ? 'phone_number' : v)
			: undefined;
		const autoVerifyAttrs = signInList
			.filter((v) => v !== 'username')
			.map((v) => v === 'phone' ? 'phone_number' : v);

		createdPool = await client.send(new CreateUserPoolCommand({
			PoolName: poolName,
			...(usernameAttrs && usernameAttrs.length > 0
				? { UsernameAttributes: usernameAttrs as ('email' | 'phone_number')[] }
				: {}),
			...(aliasAttrs && aliasAttrs.length > 0
				? { AliasAttributes: aliasAttrs as ('email' | 'phone_number')[] }
				: {}),
			...(autoVerifyAttrs.length > 0
				? { AutoVerifiedAttributes: autoVerifyAttrs as ('email' | 'phone_number')[] }
				: {}),
			MfaConfiguration: createMfaConfig,
			...(opts.selfSignUp
				? { AdminCreateUserConfig: { AllowAdminCreateUserOnly: false } }
				: {}),
			...(opts.smsMfa && snsCallerArn
				? {
					SmsConfiguration: {
						SnsCallerArn: snsCallerArn,
						ExternalId: `blocks-itest-${suffix}`,
					},
				}
				: {}),
			...(sesSourceArn
				? {
					EmailConfiguration: {
						EmailSendingAccount: 'DEVELOPER',
						SourceArn: sesSourceArn,
						From: sesFromAddress,
					},
					...(opts.emailMfa ? { UserPoolAddOns: { AdvancedSecurityMode: 'AUDIT' } } : {}),
				}
				: {}),
			Policies: {
				PasswordPolicy: {
					MinimumLength: 8,
					RequireUppercase: false,
					RequireLowercase: false,
					RequireNumbers: false,
					RequireSymbols: false,
				},
				// `AllowedFirstAuthFactors` gates which challenges appear in a
				// user's `AvailableChallenges` for USER_AUTH. Separate from
				// `EnabledMfas` (which gates MFA *after* a first factor). Pool
				// must opt each factor in here for SELECT_CHALLENGE /
				// PREFERRED_CHALLENGE to honor it. `userAuth:true` pools get
				// every supported factor; other pools keep the default
				// password-only list.
				...(opts.userAuth
					? {
						SignInPolicy: {
							AllowedFirstAuthFactors: [
								'PASSWORD',
								...(opts.emailMfa ? (['EMAIL_OTP'] as const) : ([] as const)),
								...(opts.smsMfa ? (['SMS_OTP'] as const) : ([] as const)),
							],
						},
					}
					: {}),
			},
		}));
	} catch (e) {
		// Pool creation failed AFTER we provisioned the SNS role — roll
		// back so we don't leak IAM.
		for (const undo of preCreationRollback.reverse()) {
			try { await undo(); } catch {}
		}
		throw e;
	}

	const userPoolId = createdPool.UserPool?.Id;
	if (!userPoolId) throw new Error('CreateUserPool returned no Id');

	const createdClient = await client.send(new CreateUserPoolClientCommand({
		UserPoolId: userPoolId,
		ClientName: `${poolName}-client`,
		GenerateSecret: false,
		ExplicitAuthFlows: [
			'ALLOW_USER_PASSWORD_AUTH',
			'ALLOW_REFRESH_TOKEN_AUTH',
			...(opts.userAuth ? ['ALLOW_USER_AUTH' as const] : []),
		],
	}));

	const userPoolClientId = createdClient.UserPoolClient?.ClientId;
	if (!userPoolClientId) throw new Error('CreateUserPoolClient returned no ClientId');

	// `mfaEnforcement` sets ON/OPTIONAL but Cognito also needs the
	// `EnabledMfas` list (mirrors the `mfaSecondFactor` CDK L2 prop).
	// `SmsMfaConfiguration.SmsConfiguration` is REQUIRED when SMS_MFA is
	// in EnabledMfas — the pool-level SmsConfiguration we set at
	// CreateUserPool time isn't enough, Cognito re-validates here. Passing
	// the same dummy role is fine (never exercised; custom sender
	// intercepts).
	const applyMfaConfig = async () => {
		if (enabledMfas.length === 0) return;
		const { SetUserPoolMfaConfigCommand } = await import('@aws-sdk/client-cognito-identity-provider');
		await client.send(new SetUserPoolMfaConfigCommand({
			UserPoolId: userPoolId,
			MfaConfiguration: mfaEnforcement,
			SoftwareTokenMfaConfiguration: { Enabled: enabledMfas.includes('SOFTWARE_TOKEN_MFA') },
			EmailMfaConfiguration: enabledMfas.includes('EMAIL_OTP')
				? { Message: 'Your verification code is {####}', Subject: 'Verification Code' }
				: undefined,
			SmsMfaConfiguration: enabledMfas.includes('SMS_MFA') && snsCallerArn
				? {
					SmsAuthenticationMessage: 'Your verification code is {####}',
					SmsConfiguration: {
						SnsCallerArn: snsCallerArn,
						ExternalId: `blocks-itest-${suffix}`,
					},
				}
				: undefined,
		}));
	};

	// Pool-level setup is done; now attach the custom sender if requested.
	// Done here rather than inside `CreateUserPool` because the sender
	// Lambda's resource policy references the pool ARN which we only know
	// after the pool exists. Build the handle up front so any failure in
	// `applyMfaConfig` or the sender wiring can roll it back.
	const poolHandle: TestPool = {
		client,
		userPoolId,
		userPoolClientId,
		region,
		cleanup: async () => {
			try {
				await client.send(new DeleteUserPoolClientCommand({
					UserPoolId: userPoolId,
					ClientId: userPoolClientId,
				}));
			} catch {
				// Best effort — proceed to pool deletion.
			}
			try {
				await client.send(new DeleteUserPoolCommand({ UserPoolId: userPoolId }));
			} catch {
				// Best effort — test operators can clean up manually if needed.
			}
			// Delete the dummy SNS role last (pool deletion releases
			// Cognito's hold on it).
			for (const undo of preCreationRollback.reverse()) {
				try { await undo(); } catch {}
			}
		},
	};

	if (delivery === 'custom-sender') {
		const { setupCustomSender } = await import('./custom-sender-harness.js');
		let sender: Awaited<ReturnType<typeof setupCustomSender>>;
		try {
			sender = await setupCustomSender(poolHandle);
		} catch (e) {
			// `setupCustomSender` rolls back its own partial state; we still
			// need to drop the pool so CreateUserPool isn't orphaned.
			try { await poolHandle.cleanup(); } catch {}
			throw e;
		}
		poolHandle.captureCode = sender.captureCode;
		const poolCleanup = poolHandle.cleanup;
		poolHandle.cleanup = async () => {
			// Detach + delete the sender BEFORE the pool so Cognito stops
			// firing the Lambda mid-teardown (the sender Lambda would error
			// out trying to decrypt with a key that's queued for deletion).
			// Pool delete comes last so any residual sign-in attempts fail
			// cleanly rather than hanging on the sender timeout.
			await sender.teardown();
			await poolCleanup();
		};
	}

	// Flip MFA on last — after the custom sender (if any) is wired, and
	// always through the full-teardown-on-failure path so a Cognito
	// validator rejection doesn't leave any partial setup behind.
	try {
		await applyMfaConfig();
	} catch (e) {
		try { await poolHandle.cleanup(); } catch {}
		throw e;
	}

	return poolHandle;
}

/**
 * Create and immediately confirm a test user with a permanent password.
 * Saves the 3-step `SignUp` → `ConfirmSignUp` → `AdminSetUserPassword`
 * dance most tests don't care about.
 */
export async function createConfirmedUser(
	pool: TestPool,
	username: string,
	password: string,
	extraAttrs: Record<string, string> = {},
): Promise<void> {
	await pool.client.send(new AdminCreateUserCommand({
		UserPoolId: pool.userPoolId,
		Username: username,
		UserAttributes: [
			{ Name: 'email', Value: username },
			{ Name: 'email_verified', Value: 'true' },
			...Object.entries(extraAttrs).map(([Name, Value]) => ({ Name, Value })),
		],
		MessageAction: 'SUPPRESS',
	}));
	await pool.client.send(new AdminSetUserPasswordCommand({
		UserPoolId: pool.userPoolId,
		Username: username,
		Password: password,
		Permanent: true,
	}));
}

/**
 * Admin-set a user's MFA preference. Cognito requires the matching factor
 * to be associated (for TOTP, via `AssociateSoftwareToken` + `VerifySoftwareToken`
 * while the user is signed in) before preferences stick — helpers for that
 * are separate so tests can exercise the enrollment path where needed.
 */
export async function setMfaPreference(
	pool: TestPool,
	username: string,
	pref: {
		sms?: { enabled: boolean; preferred?: boolean };
		totp?: { enabled: boolean; preferred?: boolean };
		email?: { enabled: boolean; preferred?: boolean };
	},
): Promise<void> {
	await pool.client.send(new AdminSetUserMFAPreferenceCommand({
		UserPoolId: pool.userPoolId,
		Username: username,
		...(pref.sms ? { SMSMfaSettings: { Enabled: pref.sms.enabled, PreferredMfa: pref.sms.preferred ?? false } } : {}),
		...(pref.totp ? { SoftwareTokenMfaSettings: { Enabled: pref.totp.enabled, PreferredMfa: pref.totp.preferred ?? false } } : {}),
		...(pref.email ? { EmailMfaSettings: { Enabled: pref.email.enabled, PreferredMfa: pref.email.preferred ?? false } } : {}),
	}));
}

/** Delete a user — clean up after AdminCreateUser. */
export async function deleteUser(pool: TestPool, username: string): Promise<void> {
	try {
		await pool.client.send(new AdminDeleteUserCommand({
			UserPoolId: pool.userPoolId,
			Username: username,
		}));
	} catch {
		// Best effort.
	}
}

/**
 * Re-export the SDK commands tests commonly need, so the integration test
 * file doesn't need its own @aws-sdk import block. Keeps the public surface
 * of the fixture clean.
 */
export {
	AssociateSoftwareTokenCommand,
	VerifySoftwareTokenCommand,
	AdminUpdateUserAttributesCommand,
};
