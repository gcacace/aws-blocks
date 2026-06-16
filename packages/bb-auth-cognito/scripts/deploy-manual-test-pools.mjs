#!/usr/bin/env node
/**
 * Deploy every pool + helper resource the scenario matrix uses so you can
 * drive them by hand (Postman, curl, a demo app, whatever). Stands up seven
 * pools — same config as `scenarios.sandbox.test.ts` — each with its own
 * custom-sender Lambda + KMS key + DynamoDB capture table so you can read
 * the real SMS / email codes Cognito emits.
 *
 * Writes a manifest JSON with every ID you need (pool id, client id,
 * capture table name, seeded users, etc.) plus a human-readable README
 * next to it. Teardown is handled by `teardown-manual-test-pools.mjs`
 * reading the manifest and invoking each pool's cleanup.
 *
 * Usage:
 *   # from packages/bb-auth-cognito/
 *   AWS_PROFILE=your-profile npm run deploy:manual-pools
 *
 *   # optionally pick a subset:
 *   AWS_PROFILE=your-profile POOLS=A,C,G npm run deploy:manual-pools
 *
 * Prereqs:
 *   - Verified SES identity in the calling account (domain preferred).
 *   - Sufficient IAM perms: cognito-idp:*, iam:Create/PutRole*,
 *     kms:CreateKey, lambda:*, dynamodb:*, logs:DeleteLogGroup, sts:*.
 *   - Built package (`npm run build`) — the deploy script imports compiled
 *     test-support helpers from `dist/`.
 *
 * Safety:
 *   - Every resource is tagged/named `blocks-itest-*` so you can spot them.
 *   - `teardown-manual-test-pools.mjs` drops them in reverse order.
 *   - If setup fails partway, partial state is automatically rolled back
 *     per-pool (setupTestPool has progressive rollback).
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

import {
	createConfirmedUser,
	setupTestPool,
} from '../dist/test-support/test-pool-fixture.js';
import { AdminCreateUserCommand } from '@aws-sdk/client-cognito-identity-provider';

// ── Pool plan ──────────────────────────────────────────────────────────
//
// Mirrors `scenarios.sandbox.test.ts`. Each pool serves a group of related
// manual-test flows; seeded users cover the happy path the scenario file
// exercises. All passwords are `ManualTest!1` to keep it memorable.

const DEFAULT_PASSWORD = 'ManualTest!1';

const POOL_PLAN = {
	A: {
		label: 'mfa:off + self-signup (USER_PASSWORD_AUTH)',
		scenarios: ['1 self-signup → confirm → sign-in', '10 forgot password → new password'],
		options: { nameSuffix: 'mA', totpMfa: false, mfaEnforcement: 'OFF', selfSignUp: true },
		users: [
			{ purpose: 'basic', kind: 'confirmed' },
			{ purpose: 'forgot-password', kind: 'confirmed' },
		],
	},
	B: {
		label: 'mfa:optional + TOTP (USER_PASSWORD_AUTH)',
		scenarios: ['2 optional MFA — nothing enrolled → direct sign-in', '9 admin-created temp password → NEW_PASSWORD_REQUIRED'],
		options: { nameSuffix: 'mB', totpMfa: true, mfaEnforcement: 'OPTIONAL' },
		users: [
			{ purpose: 'basic', kind: 'confirmed' },
			{ purpose: 'new-password-required', kind: 'temp-password', tempPassword: 'Temp1234!AB' },
		],
	},
	C: {
		label: 'mfa:required + [TOTP] (USER_PASSWORD_AUTH)',
		scenarios: ['3 MFA_SETUP TOTP → enroll → re-sign-in with TOTP'],
		options: { nameSuffix: 'mC', totpMfa: true, mfaEnforcement: 'ON' },
		users: [{ purpose: 'totp-setup', kind: 'confirmed' }],
	},
	D: {
		label: 'mfa:required + [EMAIL] (USER_PASSWORD_AUTH)',
		scenarios: ['4 EMAIL MFA — fresh user gets EMAIL_OTP challenge'],
		options: { nameSuffix: 'mD', totpMfa: false, emailMfa: true, mfaEnforcement: 'ON' },
		users: [{ purpose: 'email-mfa', kind: 'confirmed-unverified-email' }],
	},
	E: {
		label: 'mfa:required + [TOTP, EMAIL] (USER_PASSWORD_AUTH)',
		scenarios: ['5 default flow → EMAIL challenge', '6 setup selection → pick EMAIL'],
		options: { nameSuffix: 'mE', totpMfa: true, emailMfa: true, mfaEnforcement: 'ON' },
		users: [
			{ purpose: 'default-flow', kind: 'confirmed-unverified-email' },
			{ purpose: 'setup-selection', kind: 'confirmed-unverified-email' },
		],
	},
	F: {
		label: 'mfa:optional + [SMS, TOTP] (USER_PASSWORD_AUTH)',
		scenarios: ['7 enrolled SMS → SMS challenge', '8 enrolled TOTP+SMS → MFA_SELECTION'],
		options: { nameSuffix: 'mF', totpMfa: true, smsMfa: true, mfaEnforcement: 'OPTIONAL' },
		users: [
			{ purpose: 'sms-enrolled', kind: 'confirmed', extraAttrs: { phone_number: '+15005551007', phone_number_verified: 'true' } },
			{ purpose: 'totp-and-sms', kind: 'confirmed', extraAttrs: { phone_number: '+15005551008', phone_number_verified: 'true' } },
		],
	},
	G: {
		label: 'USER_AUTH — password + email_otp + sms_otp first factors',
		scenarios: ['11–13 preferredChallenge dispatch', '14–16 SELECT_CHALLENGE then pick factor'],
		options: {
			nameSuffix: 'mG',
			totpMfa: false,
			smsMfa: true,
			emailMfa: true,
			userAuth: true,
			mfaEnforcement: 'OPTIONAL',
		},
		users: [
			{ purpose: 'password-or-email', kind: 'confirmed' },
			{ purpose: 'sms-otp', kind: 'confirmed', extraAttrs: { phone_number: '+15005551013', phone_number_verified: 'true' } },
		],
	},
};

// ── Helpers ────────────────────────────────────────────────────────────

function uniqueUser(poolKey, purpose) {
	// `crypto.randomBytes` instead of `Math.random` — these usernames don't
	// gate any security boundary (manual-test pools, not production), but
	// CodeQL flags the latter on principle and the cost of switching is
	// nil. 4 bytes hex → 8 chars of unpredictable suffix; collisions across
	// a 7-pool deploy run are vanishingly unlikely.
	const rand = randomBytes(4).toString('hex');
	return `manual-${poolKey.toLowerCase()}-${purpose}-${rand}@example.com`;
}

async function seedUser(pool, poolKey, user) {
	const username = uniqueUser(poolKey, user.purpose);
	const password = user.kind === 'temp-password' ? user.tempPassword : DEFAULT_PASSWORD;

	if (user.kind === 'confirmed') {
		await createConfirmedUser(pool, username, password, user.extraAttrs ?? {});
	} else if (user.kind === 'confirmed-unverified-email') {
		const { AdminCreateUserCommand, AdminSetUserPasswordCommand } = await import('@aws-sdk/client-cognito-identity-provider');
		await pool.client.send(new AdminCreateUserCommand({
			UserPoolId: pool.userPoolId,
			Username: username,
			UserAttributes: [{ Name: 'email', Value: username }],
			MessageAction: 'SUPPRESS',
		}));
		await pool.client.send(new AdminSetUserPasswordCommand({
			UserPoolId: pool.userPoolId,
			Username: username,
			Password: password,
			Permanent: true,
		}));
	} else if (user.kind === 'temp-password') {
		await pool.client.send(new AdminCreateUserCommand({
			UserPoolId: pool.userPoolId,
			Username: username,
			TemporaryPassword: user.tempPassword,
			MessageAction: 'SUPPRESS',
			UserAttributes: [
				{ Name: 'email', Value: username },
				{ Name: 'email_verified', Value: 'true' },
			],
		}));
	} else {
		throw new Error(`unknown user kind: ${user.kind}`);
	}

	return { purpose: user.purpose, username, password, kind: user.kind };
}

function chooseRequestedPools() {
	const raw = process.env.POOLS;
	if (!raw) return Object.keys(POOL_PLAN);
	const requested = raw.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
	for (const key of requested) {
		if (!POOL_PLAN[key]) {
			console.error(`unknown pool key "${key}". Known: ${Object.keys(POOL_PLAN).join(', ')}`);
			process.exit(2);
		}
	}
	return requested;
}

// ── Main ───────────────────────────────────────────────────────────────

async function main() {
	const requested = chooseRequestedPools();
	console.log(`\nDeploying ${requested.length} manual-test pool(s): ${requested.join(', ')}\n`);
	console.log('Each pool takes ~90s to provision (pool + KMS key + Lambda + DDB + IAM eventual consistency).');
	console.log('The script writes a manifest at scripts/.manual-pools.json — DO NOT commit it.\n');

	const manifest = {
		createdAt: new Date().toISOString(),
		region: process.env.BLOCKS_INTEGRATION_REGION ?? process.env.AWS_REGION ?? 'us-east-1',
		awsProfile: process.env.AWS_PROFILE ?? '(default)',
		defaultPassword: DEFAULT_PASSWORD,
		pools: {},
	};

	const deployed = [];
	let hadError = null;

	try {
		for (const key of requested) {
			const plan = POOL_PLAN[key];
			console.log(`[pool ${key}] ${plan.label} — setting up…`);
			const t0 = Date.now();
			const pool = await setupTestPool(plan.options);
			deployed.push({ key, pool });
			console.log(`[pool ${key}]   ✓ pool ${pool.userPoolId} / client ${pool.userPoolClientId} (${Math.round((Date.now() - t0) / 1000)}s)`);

			const captureTable = `blocks-itest-capture-${pool.userPoolId.split('_').pop()?.toLowerCase()}`;
			const users = [];
			for (const userPlan of plan.users) {
				const seeded = await seedUser(pool, key, userPlan);
				users.push(seeded);
				console.log(`[pool ${key}]   ✓ user ${seeded.username} (${seeded.purpose})`);
			}

			manifest.pools[key] = {
				label: plan.label,
				scenarios: plan.scenarios,
				options: plan.options,
				userPoolId: pool.userPoolId,
				userPoolClientId: pool.userPoolClientId,
				region: pool.region,
				captureTable,
				users,
			};
		}
	} catch (e) {
		hadError = e;
		console.error(`\n✗ Deploy failed: ${e.message}\n`);
	}

	// Write manifest regardless of success — lets teardown reap whatever
	// did come up.
	const __dirname = dirname(fileURLToPath(import.meta.url));
	await mkdir(__dirname, { recursive: true });
	const manifestPath = join(__dirname, '.manual-pools.json');
	await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
	console.log(`\nManifest written: ${manifestPath}`);

	if (hadError) {
		console.error('\nSome pools are provisioned, some are not. Run teardown to clean up:');
		console.error(`  npm run teardown:manual-pools\n`);
		// Attach in-memory pool handles so teardown can reap even pools
		// that weren't fully seeded — but we can't persist handles, so
		// teardown reads manifest only. Log what still needs manual love:
		if (deployed.length > 0) {
			const deployedKeys = deployed.map((d) => d.key);
			console.error(`Deployed pools to clean up: ${deployedKeys.join(', ')}`);
		}
		process.exit(1);
	}

	console.log('\n━━━ Ready for manual testing ━━━\n');
	printCheatSheet(manifest);
}

function printCheatSheet(manifest) {
	console.log(`Region: ${manifest.region}`);
	console.log(`Default password: ${manifest.defaultPassword}\n`);
	for (const [key, entry] of Object.entries(manifest.pools)) {
		console.log(`● Pool ${key} — ${entry.label}`);
		console.log(`    userPoolId:       ${entry.userPoolId}`);
		console.log(`    userPoolClientId: ${entry.userPoolClientId}`);
		console.log(`    captureTable:     ${entry.captureTable}`);
		console.log(`    scenarios:`);
		for (const s of entry.scenarios) console.log(`      - ${s}`);
		console.log(`    users:`);
		for (const u of entry.users) {
			const pw = u.kind === 'temp-password'
				? `(temp) ${manifest.pools[key].users.find((x) => x.purpose === u.purpose)?.password ?? '?'}`
				: `${manifest.defaultPassword}`;
			console.log(`      - ${u.purpose}: ${u.username} / ${pw}`);
		}
		console.log('');
	}
	console.log('Tip — reading captured OTP codes:');
	console.log('  aws dynamodb get-item \\');
	console.log('    --table-name <captureTable> \\');
	console.log('    --key \'{"pk":{"S":"<username>#mfa"}}\'');
	console.log('');
	console.log('Tip — BB env vars (for a Blocks-wired Next.js app pointing at pool X):');
	console.log('  export BLOCKS_AUTH_COGNITO_AUTH_USER_POOL_ID=<pool.userPoolId>');
	console.log('  export BLOCKS_AUTH_COGNITO_AUTH_CLIENT_ID=<pool.userPoolClientId>');
	console.log('  export BLOCKS_AUTH_COGNITO_AUTH_REGION=<pool.region>');
	console.log('  export BLOCKS_AUTH_COGNITO_AUTH_SESSION_SECRET_PARAM=__bb-manual__');
	console.log('');
}

main().catch((e) => {
	console.error('Fatal error:', e);
	process.exit(1);
});
