#!/usr/bin/env node
/**
 * Tear down everything `deploy-manual-test-pools.mjs` provisioned. Reads the
 * manifest at `scripts/.manual-pools.json` — so this script doesn't need any
 * in-process handles from the deploy run; you can run it from a fresh shell.
 *
 * Resource map (per pool, derived from `userPoolId` suffix):
 *   - Cognito user pool + client
 *   - Lambda `blocks-itest-sender-<suffix>`  (+ log group)
 *   - IAM role `blocks-itest-sender-<suffix>` (+ inline `kms-ddb` + basic exec attach)
 *   - KMS alias `alias/blocks-itest-sender-<suffix>` + scheduled key deletion
 *   - DynamoDB table `blocks-itest-capture-<suffix>`
 *   - Dummy SNS role `blocks-itest-sns-<suffix>` (when smsMfa was enabled)
 *
 * Order: detach-then-delete. Cognito stops firing the sender Lambda first so
 * mid-teardown invocations don't throw on a key that's already queued for
 * deletion; then we kill the pool, then the sender resources.
 *
 * Every step is best-effort — partial state from a failed deploy is common,
 * so we log + press on rather than short-circuit.
 *
 * Usage:
 *   AWS_PROFILE=your-profile npm run teardown:manual-pools
 *
 *   # only drop specific pools:
 *   AWS_PROFILE=your-profile POOLS=A,C npm run teardown:manual-pools
 */
import { readFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
	CognitoIdentityProviderClient,
	DeleteUserPoolClientCommand,
	DeleteUserPoolCommand,
	DescribeUserPoolCommand,
	UpdateUserPoolCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import {
	DeleteFunctionCommand,
	LambdaClient,
} from '@aws-sdk/client-lambda';
import {
	CloudWatchLogsClient,
	DeleteLogGroupCommand,
} from '@aws-sdk/client-cloudwatch-logs';
import {
	DeleteTableCommand,
	DynamoDBClient,
} from '@aws-sdk/client-dynamodb';
import {
	DeleteAliasCommand,
	DescribeKeyCommand,
	KMSClient,
	ScheduleKeyDeletionCommand,
} from '@aws-sdk/client-kms';
import {
	DeleteRoleCommand,
	DeleteRolePolicyCommand,
	DetachRolePolicyCommand,
	IAMClient,
} from '@aws-sdk/client-iam';

function poolSuffix(userPoolId) {
	return userPoolId.split('_').pop()?.toLowerCase();
}

async function safe(label, fn) {
	try {
		await fn();
		console.log(`    ✓ ${label}`);
	} catch (e) {
		const msg = (e && e.message) || String(e);
		if (/ResourceNotFoundException|NoSuchEntity|NotFoundException/.test(e?.name ?? '')) {
			console.log(`    • ${label} (already gone)`);
		} else {
			console.log(`    ✗ ${label}: ${msg}`);
		}
	}
}

async function teardownOnePool(key, entry) {
	const region = entry.region;
	const suffix = poolSuffix(entry.userPoolId);
	if (!suffix) {
		console.warn(`[pool ${key}] invalid userPoolId ${entry.userPoolId}; skipping`);
		return;
	}

	const cognito = new CognitoIdentityProviderClient({ region });
	const lambda = new LambdaClient({ region });
	const logs = new CloudWatchLogsClient({ region });
	const ddb = new DynamoDBClient({ region });
	const kms = new KMSClient({ region });
	const iam = new IAMClient({ region });

	console.log(`\n[pool ${key}] ${entry.label}`);
	console.log(`[pool ${key}] userPoolId=${entry.userPoolId} suffix=${suffix}`);

	const fnName = `blocks-itest-sender-${suffix}`;
	const logGroup = `/aws/lambda/${fnName}`;
	const roleName = `blocks-itest-sender-${suffix}`;
	const keyAlias = `alias/blocks-itest-sender-${suffix}`;
	const tableName = entry.captureTable ?? `blocks-itest-capture-${suffix}`;
	const dummySnsRoleName = `blocks-itest-sns-${suffix}`;

	// 1. Detach the custom sender from the pool so Cognito stops invoking
	//    the Lambda while we delete it. Read-then-write so we don't wipe
	//    unrelated LambdaConfig entries (though we're the only one adding
	//    any in this test setup).
	await safe('detach custom sender from pool', async () => {
		const described = await cognito.send(new DescribeUserPoolCommand({ UserPoolId: entry.userPoolId }));
		const existing = described.UserPool;
		if (!existing) return;
		const lambdaConfig = { ...(existing.LambdaConfig ?? {}) };
		delete lambdaConfig.KMSKeyID;
		delete lambdaConfig.CustomSMSSender;
		delete lambdaConfig.CustomEmailSender;
		await cognito.send(new UpdateUserPoolCommand({
			UserPoolId: entry.userPoolId,
			Policies: existing.Policies,
			MfaConfiguration: existing.MfaConfiguration,
			SmsConfiguration: existing.SmsConfiguration,
			EmailConfiguration: existing.EmailConfiguration,
			UserPoolAddOns: existing.UserPoolAddOns,
			AutoVerifiedAttributes: existing.AutoVerifiedAttributes,
			LambdaConfig: lambdaConfig,
		}));
	});

	// 2. Pool client + pool.
	await safe('delete user pool client', async () => {
		await cognito.send(new DeleteUserPoolClientCommand({
			UserPoolId: entry.userPoolId,
			ClientId: entry.userPoolClientId,
		}));
	});
	await safe('delete user pool', async () => {
		await cognito.send(new DeleteUserPoolCommand({ UserPoolId: entry.userPoolId }));
	});

	// 3. Sender Lambda + log group.
	await safe('delete sender Lambda', async () => {
		await lambda.send(new DeleteFunctionCommand({ FunctionName: fnName }));
	});
	await safe('delete Lambda log group', async () => {
		await logs.send(new DeleteLogGroupCommand({ logGroupName: logGroup }));
	});

	// 4. IAM role (inline policy → managed detach → role).
	await safe('delete sender role inline policy', async () => {
		await iam.send(new DeleteRolePolicyCommand({ RoleName: roleName, PolicyName: 'kms-ddb' }));
	});
	await safe('detach basic-execution managed policy', async () => {
		await iam.send(new DetachRolePolicyCommand({
			RoleName: roleName,
			PolicyArn: 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
		}));
	});
	await safe('delete sender IAM role', async () => {
		await iam.send(new DeleteRoleCommand({ RoleName: roleName }));
	});

	// 5. KMS alias + scheduled key deletion.
	await safe('schedule KMS key deletion', async () => {
		const desc = await kms.send(new DescribeKeyCommand({ KeyId: keyAlias }));
		const keyId = desc.KeyMetadata?.KeyId;
		if (keyId) {
			await kms.send(new ScheduleKeyDeletionCommand({ KeyId: keyId, PendingWindowInDays: 7 }));
		}
	});
	await safe('delete KMS alias', async () => {
		await kms.send(new DeleteAliasCommand({ AliasName: keyAlias }));
	});

	// 6. DDB capture table.
	await safe('delete DDB capture table', async () => {
		await ddb.send(new DeleteTableCommand({ TableName: tableName }));
	});

	// 7. Dummy SNS role (pools without SMS never created it — that's fine,
	//    `NoSuchEntity` is silenced).
	await safe('delete inline sns-publish policy on dummy SNS role', async () => {
		await iam.send(new DeleteRolePolicyCommand({ RoleName: dummySnsRoleName, PolicyName: 'sns-publish' }));
	});
	await safe('delete dummy SNS role', async () => {
		await iam.send(new DeleteRoleCommand({ RoleName: dummySnsRoleName }));
	});
}

async function main() {
	const __dirname = dirname(fileURLToPath(import.meta.url));
	const manifestPath = join(__dirname, '.manual-pools.json');

	let manifest;
	try {
		manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
	} catch (e) {
		console.error(`No manifest at ${manifestPath}. Did you run deploy:manual-pools?`);
		console.error(`(${e.message})`);
		process.exit(2);
	}

	const filter = process.env.POOLS?.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
	const entries = Object.entries(manifest.pools ?? {}).filter(([k]) => !filter || filter.includes(k));

	if (entries.length === 0) {
		console.error('Manifest has no pools to tear down (filter may have excluded everything).');
		process.exit(2);
	}

	console.log(`Tearing down ${entries.length} pool(s): ${entries.map(([k]) => k).join(', ')}`);

	for (const [key, entry] of entries) {
		await teardownOnePool(key, entry);
	}

	// Drop the manifest only if we tore down everything in it.
	if (!filter) {
		try {
			await rm(manifestPath);
			console.log(`\nRemoved manifest ${manifestPath}`);
		} catch {}
	} else {
		// Rewrite manifest without the torn-down pools so subsequent runs
		// don't try to reap them again.
		const remaining = { ...manifest, pools: {} };
		for (const [k, v] of Object.entries(manifest.pools)) {
			if (!filter.includes(k)) remaining.pools[k] = v;
		}
		const { writeFile } = await import('node:fs/promises');
		await writeFile(manifestPath, JSON.stringify(remaining, null, 2) + '\n', 'utf8');
		console.log(`\nUpdated manifest: ${Object.keys(remaining.pools).length} pool(s) still tracked.`);
	}

	console.log('\nDone.');
}

main().catch((e) => {
	console.error('Fatal error:', e);
	process.exit(1);
});
