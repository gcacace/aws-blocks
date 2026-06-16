// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Custom SMS/Email Sender Lambda harness for integration tests.
 *
 * Why this exists:
 *
 * Cognito's MFA/OTP codes are delivered out-of-band via SNS (SMS) or SES
 * (email). Integration tests can't read a real SMS or a real inbox, so the
 * naive approach is "assert the challenge fires with the right shape, don't
 * verify the code round-trip." That's a half-test — it catches wire-level
 * bugs (wrong `ChallengeResponses` key, wrong envelope session) but lets
 * any code-verification bug through.
 *
 * The Cognito **custom sender** extension point
 * (`LambdaConfig.CustomSMSSender` / `CustomEmailSender`) replaces the SNS/
 * SES deliveries with a customer-written Lambda. Cognito encrypts the
 * outgoing code with a KMS CMK and hands the ciphertext to the Lambda;
 * the Lambda decrypts it with the same key. Intended for customers who
 * want to use their own delivery provider (Twilio, SendGrid, …) — we
 * weaponize it as a test-time "capture" Lambda: decrypt the code, stash
 * it in a DynamoDB table, never deliver to a real user.
 *
 * Security note: this is **test-only**. A production pool with a custom
 * sender Lambda wired this way would silently swallow codes to every user
 * (they'd never arrive). The DDB table TTLs items after 10 minutes so even
 * test leaks self-expire.
 *
 * Flow:
 *
 *   1. `setupCustomSender(pool)` — creates KMS CMK + IAM role + DDB table
 *      + two Lambdas (SMS + Email) + grants + `SetRiskConfiguration`/
 *      `UpdateUserPool({LambdaConfig, KMSKeyID})`. Returns a `captureCode`
 *      function + `teardown`.
 *   2. Test triggers a flow that emits a code (MFA challenge, sign-up,
 *      password reset, etc.).
 *   3. Test calls `await captureCode(username, purpose)` — polls DDB for
 *      up to 15s until the Lambda has written the decrypted code.
 *   4. Test uses the code in a follow-up `confirmSignIn` / `confirmSignUp`.
 *
 * Not run on every unit-test pass — the DDB + Lambda + KMS operations
 * cost ~15s to provision and tear down, and require real AWS credentials.
 * Gated behind `BLOCKS_INTEGRATION=1` via the calling test file's `skip`.
 */

import {
	CloudWatchLogsClient,
	DeleteLogGroupCommand,
} from '@aws-sdk/client-cloudwatch-logs';
import {
	CognitoIdentityProviderClient,
	UpdateUserPoolCommand,
	DescribeUserPoolCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import {
	CreateTableCommand,
	DeleteTableCommand,
	DynamoDBClient,
	GetItemCommand,
	UpdateTimeToLiveCommand,
	waitUntilTableExists,
} from '@aws-sdk/client-dynamodb';
import {
	DescribeKeyCommand,
	KMSClient,
	ScheduleKeyDeletionCommand,
} from '@aws-sdk/client-kms';
// KMS + CreateKey + CreateAlias come from the key-management namespace —
// DescribeKey lives there too but in practice the re-export below keeps the
// imports tight.
import {
	CreateAliasCommand,
	CreateKeyCommand,
	DeleteAliasCommand,
} from '@aws-sdk/client-kms';
import {
	AddPermissionCommand,
	CreateFunctionCommand,
	DeleteFunctionCommand,
	LambdaClient,
	waitUntilFunctionActiveV2,
} from '@aws-sdk/client-lambda';
import {
	AttachRolePolicyCommand,
	CreateRoleCommand,
	DeleteRoleCommand,
	DeleteRolePolicyCommand,
	DetachRolePolicyCommand,
	IAMClient,
	PutRolePolicyCommand,
} from '@aws-sdk/client-iam';
import {
	GetCallerIdentityCommand,
	STSClient,
} from '@aws-sdk/client-sts';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildZip } from './zip.js';
import type { TestPool } from './test-pool-fixture.js';

export interface CustomSenderHarness {
	/**
	 * Poll the DDB capture table until a code for `(username, purpose)`
	 * shows up or `timeoutMs` elapses. `purpose` is one of the Cognito
	 * trigger source categories:
	 *   - `'mfa'` — MFA challenge (SMS_MFA / EMAIL_OTP / SMS_OTP).
	 *   - `'signup'` — initial email/phone verification code.
	 *   - `'resend'` — resend-confirmation-code.
	 *   - `'forgot'` — password-reset.
	 *   - `'verify-attribute'` — post-sign-up attribute verification.
	 *   - `'admin-create'` — AdminCreateUser temporary password.
	 *   - `'mfa-setup'` — EMAIL_OTP code emitted by MFA_SETUP email flow.
	 */
	captureCode(username: string, purpose: string, timeoutMs?: number): Promise<string>;
	/** Teardown — always invoke in `afterAll` via try/finally. */
	teardown(): Promise<void>;
}

/**
 * esbuild-bundle the Lambda source into a single CommonJS file so the zip
 * can ship it without the Lambda runtime needing to resolve deps. The
 * source lives at `./sender-lambda-source.js` (TS ignores it — `allowJs`
 * is false — so it's never compiled, just read). We bundle at fixture
 * setup time so a fresh build picks up any local changes to the source.
 *
 * The AWS Encryption SDK (`@aws-crypto/client-node`) is required for
 * Cognito's custom-sender ciphertext — bare KMS `Decrypt` fails with
 * `InvalidCiphertextException` because Cognito wraps codes with the
 * Encryption SDK's envelope format.
 */
async function buildSenderLambdaBundle(): Promise<Buffer> {
	const { build } = await import('esbuild');
	const __dirname = dirname(fileURLToPath(import.meta.url));
	const entry = join(__dirname, 'sender-lambda-source.js');
	// When compiled, __dirname points at dist/test-support/. The source
	// file is at src/test-support/. Try both paths.
	const srcEntry = entry.replace('/dist/', '/src/');
	const { existsSync } = await import('node:fs');
	const resolvedEntry = existsSync(entry) ? entry : srcEntry;
	const result = await build({
		entryPoints: [resolvedEntry],
		bundle: true,
		platform: 'node',
		target: 'node20',
		format: 'cjs',
		write: false,
		// AWS SDK v3 is pre-installed on Lambda Node 20 runtime, so keep
		// it external for a smaller bundle + faster cold start.
		external: ['@aws-sdk/*'],
		legalComments: 'none',
		minify: false,
	});
	const out = result.outputFiles[0];
	if (!out) throw new Error('esbuild produced no output for sender Lambda');
	return Buffer.from(out.contents);
}

/**
 * Provision a custom-sender harness for `pool`. Idempotent-ish: every call
 * mints a new KMS CMK + IAM role + Lambda + table, so concurrent test runs
 * on the same pool are unsafe (but every integration suite creates its own
 * pool anyway, so this doesn't happen in practice).
 */
export async function setupCustomSender(pool: TestPool): Promise<CustomSenderHarness> {
	const region = pool.region;
	const suffix = pool.userPoolId.split('_').pop()?.toLowerCase() ?? Math.random().toString(36).slice(2, 8);
	const fnNameBase = `blocks-itest-sender-${suffix}`;
	const tableName = `blocks-itest-capture-${suffix}`;
	const roleName = `blocks-itest-sender-${suffix}`;
	const keyAlias = `alias/blocks-itest-sender-${suffix}`;

	const sts = new STSClient({ region });
	const accountId = (await sts.send(new GetCallerIdentityCommand({}))).Account!;

	const kms = new KMSClient({ region });
	const iam = new IAMClient({ region });
	const ddb = new DynamoDBClient({ region });
	const lambda = new LambdaClient({ region });
	const logs = new CloudWatchLogsClient({ region });
	const cognito = new CognitoIdentityProviderClient({ region });

	// Track what's been created so a partial-setup failure can tear down
	// in reverse order. Every branch below pushes onto `rollback` as soon
	// as it succeeds; the catch at the bottom of the body fires them on
	// error so we never leak KMS keys or DDB tables (both outlive the
	// pool and cost money).
	const rollback: Array<() => Promise<void>> = [];

	try {

	// ── 1. Capture table ────────────────────────────────────────────────
	await ddb.send(new CreateTableCommand({
		TableName: tableName,
		AttributeDefinitions: [{ AttributeName: 'pk', AttributeType: 'S' }],
		KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }],
		BillingMode: 'PAY_PER_REQUEST',
	}));
	await waitUntilTableExists({ client: ddb, maxWaitTime: 60 }, { TableName: tableName });
	rollback.push(async () => {
		try { await ddb.send(new DeleteTableCommand({ TableName: tableName })); } catch {}
	});
	await ddb.send(new UpdateTimeToLiveCommand({
		TableName: tableName,
		TimeToLiveSpecification: { AttributeName: 'ttl', Enabled: true },
	}));

	// ── 2. KMS CMK for Cognito code encryption ──────────────────────────
	// Policy: account root + the sender Lambda role have Decrypt; Cognito
	// gets kms:Encrypt (Cognito encrypts the code before invoking the
	// sender Lambda). Using a single symmetric key, which is what the
	// Cognito custom-sender API requires.
	const keyPolicy = JSON.stringify({
		Version: '2012-10-17',
		Statement: [
			{
				Sid: 'EnableIamUserPermissions',
				Effect: 'Allow',
				Principal: { AWS: `arn:aws:iam::${accountId}:root` },
				Action: 'kms:*',
				Resource: '*',
			},
			{
				Sid: 'AllowCognitoEncrypt',
				Effect: 'Allow',
				Principal: { Service: 'cognito-idp.amazonaws.com' },
				Action: ['kms:Encrypt', 'kms:Decrypt', 'kms:GenerateDataKey*', 'kms:DescribeKey'],
				Resource: '*',
			},
		],
	});
	// KMS CreateKey has a low account-wide rate limit (5 RPS default) and
	// the SDK's default retries aren't always enough when multiple test
	// suites run back-to-back. Retry with exponential backoff ourselves
	// on `Throttling` / `ThrottlingException`.
	let createdKey: { KeyMetadata?: { KeyId?: string; Arn?: string } } | undefined;
	let lastKmsErr: unknown;
	for (let attempt = 0; attempt < 6; attempt++) {
		try {
			createdKey = await kms.send(new CreateKeyCommand({
				Description: `blocks-auth-cognito integration test sender key (${suffix})`,
				KeyUsage: 'ENCRYPT_DECRYPT',
				Policy: keyPolicy,
			}));
			break;
		} catch (e) {
			lastKmsErr = e;
			const name = (e as Error).name;
			if (!/Throttling/.test(name)) throw e;
			await sleep(2_000 * 2 ** attempt); // 2s, 4s, 8s, 16s, 32s, 64s
		}
	}
	if (!createdKey) throw lastKmsErr;
	const keyId = createdKey.KeyMetadata!.KeyId!;
	const keyArn = createdKey.KeyMetadata!.Arn!;
	rollback.push(async () => {
		try { await kms.send(new ScheduleKeyDeletionCommand({ KeyId: keyId, PendingWindowInDays: 7 })); } catch {}
	});
	await kms.send(new CreateAliasCommand({ AliasName: keyAlias, TargetKeyId: keyId }));
	rollback.push(async () => {
		try { await kms.send(new DeleteAliasCommand({ AliasName: keyAlias })); } catch {}
	});

	// ── 3. IAM role for the sender Lambda ───────────────────────────────
	const assumeRolePolicy = JSON.stringify({
		Version: '2012-10-17',
		Statement: [{
			Effect: 'Allow',
			Principal: { Service: 'lambda.amazonaws.com' },
			Action: 'sts:AssumeRole',
		}],
	});
	await iam.send(new CreateRoleCommand({
		RoleName: roleName,
		AssumeRolePolicyDocument: assumeRolePolicy,
		Description: 'blocks-auth-cognito integration test custom sender',
	}));
	rollback.push(async () => {
		try { await iam.send(new DeleteRoleCommand({ RoleName: roleName })); } catch {}
	});
	await iam.send(new AttachRolePolicyCommand({
		RoleName: roleName,
		PolicyArn: 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
	}));
	rollback.push(async () => {
		try {
			await iam.send(new DetachRolePolicyCommand({
				RoleName: roleName,
				PolicyArn: 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
			}));
		} catch {}
	});
	await iam.send(new PutRolePolicyCommand({
		RoleName: roleName,
		PolicyName: 'kms-ddb',
		PolicyDocument: JSON.stringify({
			Version: '2012-10-17',
			Statement: [
				{
					Effect: 'Allow',
					// Encryption SDK needs GenerateDataKey/DescribeKey alongside
					// Decrypt for envelope unwrapping.
					Action: ['kms:Decrypt', 'kms:GenerateDataKey*', 'kms:DescribeKey'],
					Resource: keyArn,
				},
				{
					Effect: 'Allow',
					Action: ['dynamodb:PutItem'],
					Resource: `arn:aws:dynamodb:${region}:${accountId}:table/${tableName}`,
				},
			],
		}),
	}));
	rollback.push(async () => {
		try { await iam.send(new DeleteRolePolicyCommand({ RoleName: roleName, PolicyName: 'kms-ddb' })); } catch {}
	});

	// IAM eventual consistency — role isn't immediately assumable.
	await sleep(10_000);

	// ── 4. Lambda function (one; wire both SMS + Email triggers at it) ──
	// esbuild-bundle the Lambda source so it ships with its deps inlined.
	// AWS SDK is provided by the Lambda runtime; everything else
	// (Encryption SDK, etc.) is bundled.
	const bundle = await buildSenderLambdaBundle();
	const zip = buildZip([{ name: 'index.js', body: bundle }]);
	const roleArn = `arn:aws:iam::${accountId}:role/${roleName}`;
	const fnName = `${fnNameBase}`;
	await lambda.send(new CreateFunctionCommand({
		FunctionName: fnName,
		// Raw SDK string (not the CDK `Runtime` enum). Keep roughly in step
		// with core's DEFAULT_NODE_RUNTIME; this is test-only, so a stale
		// value just fails loudly at function creation, not in production.
		Runtime: 'nodejs24.x',
		Role: roleArn,
		Handler: 'index.handler',
		Code: { ZipFile: zip },
		Environment: {
			Variables: {
				CAPTURE_TABLE_NAME: tableName,
				KEY_ARN: keyArn,
			},
		},
		Timeout: 15,
		MemorySize: 256,
		Description: 'blocks-auth-cognito integration test custom sender (capture to DDB)',
	}));
	rollback.push(async () => {
		try { await lambda.send(new DeleteFunctionCommand({ FunctionName: fnName })); } catch {}
		try { await logs.send(new DeleteLogGroupCommand({ logGroupName: `/aws/lambda/${fnName}` })); } catch {}
	});
	await waitUntilFunctionActiveV2({ client: lambda, maxWaitTime: 60 }, { FunctionName: fnName });
	const fnArn = `arn:aws:lambda:${region}:${accountId}:function:${fnName}`;

	// Cognito must be allowed to invoke the Lambda — resource policy
	// statement keyed per pool.
	await lambda.send(new AddPermissionCommand({
		FunctionName: fnName,
		StatementId: 'cognito-invoke',
		Action: 'lambda:InvokeFunction',
		Principal: 'cognito-idp.amazonaws.com',
		SourceArn: `arn:aws:cognito-idp:${region}:${accountId}:userpool/${pool.userPoolId}`,
	}));

	// ── 5. Wire the Lambda into the pool's LambdaConfig + KMSKeyID ──────
	// Read current pool, merge in the sender config (UpdateUserPool is a
	// full-replace API — dropping the MFA/policy config we just set would
	// be silent data loss).
	const described = await cognito.send(new DescribeUserPoolCommand({ UserPoolId: pool.userPoolId }));
	const existing = described.UserPool!;
	await cognito.send(new UpdateUserPoolCommand({
		UserPoolId: pool.userPoolId,
		Policies: existing.Policies,
		MfaConfiguration: existing.MfaConfiguration,
		SmsConfiguration: existing.SmsConfiguration,
		EmailConfiguration: existing.EmailConfiguration,
		UserPoolAddOns: existing.UserPoolAddOns,
		AutoVerifiedAttributes: existing.AutoVerifiedAttributes,
		// `AdminCreateUserConfig` defaults to `AllowAdminCreateUserOnly:true`
		// when omitted from `UpdateUserPool` — silently disabling self-signup
		// on pools that were created with it enabled. Always echo it back.
		AdminCreateUserConfig: existing.AdminCreateUserConfig,
		LambdaConfig: {
			...(existing.LambdaConfig ?? {}),
			KMSKeyID: keyArn,
			CustomSMSSender: { LambdaVersion: 'V1_0', LambdaArn: fnArn },
			CustomEmailSender: { LambdaVersion: 'V1_0', LambdaArn: fnArn },
		},
	}));

	// ── 6. captureCode helper ──────────────────────────────────────────
	const captureCode = async (
		username: string,
		purpose: string,
		timeoutMs = 15_000,
	): Promise<string> => {
		const deadline = Date.now() + timeoutMs;
		const key = `${username}#${purpose}`;
		while (Date.now() < deadline) {
			const resp = await ddb.send(new GetItemCommand({
				TableName: tableName,
				Key: { pk: { S: key } },
			}));
			if (resp.Item?.code?.S) return resp.Item.code.S;
			await sleep(500);
		}
		// On timeout, dump whatever the sender DID write so the test
		// author can see if the purpose normalization was off, or if the
		// Lambda never fired at all.
		const { ScanCommand } = await import('@aws-sdk/client-dynamodb');
		try {
			const scan = await ddb.send(new ScanCommand({
				TableName: tableName,
				Limit: 20,
			}));
			const rows = (scan.Items ?? []).map((item) => ({
				pk: item.pk?.S,
				purpose: item.purpose?.S,
				triggerSource: item.triggerSource?.S,
				hasCode: Boolean(item.code?.S),
			}));
			throw new Error(
				`captureCode timed out for ${key} after ${timeoutMs}ms. `
				+ `DDB capture table contents (${rows.length} items): ${JSON.stringify(rows)}`,
			);
		} catch (e) {
			if (e instanceof Error && e.message.startsWith('captureCode timed out')) throw e;
			// Scan itself failed — fall back to the simple error.
			throw new Error(`captureCode timed out for ${key} after ${timeoutMs}ms (scan failed: ${(e as Error).message})`);
		}
	};

	// ── 7. Teardown ────────────────────────────────────────────────────
	const teardown = async () => {
		// Order matters: detach from pool FIRST so Cognito stops firing the
		// sender while we delete it. Each step best-effort; log and press on.
		try {
			await cognito.send(new UpdateUserPoolCommand({
				UserPoolId: pool.userPoolId,
				Policies: existing.Policies,
				MfaConfiguration: existing.MfaConfiguration,
				SmsConfiguration: existing.SmsConfiguration,
				EmailConfiguration: existing.EmailConfiguration,
				UserPoolAddOns: existing.UserPoolAddOns,
				AutoVerifiedAttributes: existing.AutoVerifiedAttributes,
				AdminCreateUserConfig: existing.AdminCreateUserConfig,
				LambdaConfig: existing.LambdaConfig ?? {},
			}));
		} catch (e) {
			console.warn('[custom-sender teardown] detach LambdaConfig failed:', (e as Error).message);
		}
		try { await lambda.send(new DeleteFunctionCommand({ FunctionName: fnName })); } catch {}
		try { await logs.send(new DeleteLogGroupCommand({ logGroupName: `/aws/lambda/${fnName}` })); } catch {}
		try { await iam.send(new DeleteRolePolicyCommand({ RoleName: roleName, PolicyName: 'kms-ddb' })); } catch {}
		try {
			await iam.send(new DetachRolePolicyCommand({
				RoleName: roleName,
				PolicyArn: 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
			}));
		} catch {}
		try { await iam.send(new DeleteRoleCommand({ RoleName: roleName })); } catch {}
		try { await ddb.send(new DeleteTableCommand({ TableName: tableName })); } catch {}
		try { await kms.send(new DeleteAliasCommand({ AliasName: keyAlias })); } catch {}
		try {
			// KMS has a 7-day minimum pending-deletion window. Tests don't
			// pay for the key during the pending window; the alias is gone
			// so the next run's suffix collision is impossible.
			await kms.send(new ScheduleKeyDeletionCommand({ KeyId: keyId, PendingWindowInDays: 7 }));
		} catch {}
	};

	// Belt-and-braces: a sanity assertion that the key is live before the
	// harness is used — otherwise the first captureCode call hangs until
	// the timeout and the test author has no idea why.
	await kms.send(new DescribeKeyCommand({ KeyId: keyId }));

	return { captureCode, teardown };

	} catch (e) {
		// Partial setup — fire every rollback we recorded in reverse order
		// so nothing leaks. Surface the original error.
		for (const undo of rollback.reverse()) {
			try { await undo(); } catch (undoErr) {
				console.warn('[custom-sender rollback]', (undoErr as Error).message);
			}
		}
		throw e;
	}
}
