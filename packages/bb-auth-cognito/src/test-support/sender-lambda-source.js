// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/* eslint-disable */
/**
 * Cognito custom SMS/Email sender Lambda — test-only.
 *
 * Receives `CustomSMSSender_*` / `CustomEmailSender_*` events, decrypts
 * `request.code` using the AWS Encryption SDK (NOT bare KMS — Cognito
 * wraps the plaintext with envelope metadata that only the Encryption
 * SDK can unwrap), and writes the plaintext code to DynamoDB under keys
 * the test harness polls.
 *
 * Not shipped as a package; bundled as a single-file Lambda via esbuild
 * in `custom-sender-harness.ts`.
 */

const { DynamoDBClient, PutItemCommand } = require('@aws-sdk/client-dynamodb');
const { KmsKeyringNode, buildClient, CommitmentPolicy } = require('@aws-crypto/client-node');

const { decrypt } = buildClient(CommitmentPolicy.REQUIRE_ENCRYPT_ALLOW_DECRYPT);

const region = process.env.AWS_REGION;
const ddb = new DynamoDBClient({ region });
const TABLE = process.env.CAPTURE_TABLE_NAME;
const KEY_ARN = process.env.KEY_ARN;
const keyring = new KmsKeyringNode({
	generatorKeyId: KEY_ARN,
	keyIds: [KEY_ARN],
});

exports.handler = async (event) => {
	console.log('sender invoked', JSON.stringify({
		triggerSource: event?.triggerSource,
		userName: event?.userName,
		hasCode: Boolean(event?.request?.code),
	}));

	const ciphertext = event?.request?.code;
	if (!ciphertext) {
		await write(event, '');
		return event;
	}
	let code = '';
	try {
		const { plaintext } = await decrypt(keyring, Buffer.from(ciphertext, 'base64'));
		code = Buffer.from(plaintext).toString('utf8');
	} catch (e) {
		code = '[decrypt-error:' + (e?.name ?? 'unknown') + ']';
		console.log('decrypt failed', (e?.message) || e);
	}
	await write(event, code);
	return event;
};

async function write(event, code) {
	// Cognito's custom-sender events set `userName` to the user's `sub`
	// (UUID), not the sign-in alias. Tests drive by email/alias, so we
	// write under every available key — the capturing test can look up
	// by email, phone, or sub.
	const sub = event?.userName || '';
	const emailAttr = event?.request?.userAttributes?.email || '';
	const phoneAttr = event?.request?.userAttributes?.phone_number || '';
	const purposeRaw = (event?.triggerSource || '').toLowerCase();
	const purpose = purposeRaw.startsWith('custom') ? normalize(purposeRaw) : purposeRaw;
	const ttl = Math.floor(Date.now() / 1000) + 600;
	const keys = new Set([sub, emailAttr, phoneAttr].filter(Boolean));
	if (keys.size === 0) keys.add('unknown');
	const now = Date.now();
	for (const k of keys) {
		await ddb.send(new PutItemCommand({
			TableName: TABLE,
			Item: {
				pk: { S: k + '#' + purpose },
				username: { S: k },
				purpose: { S: purpose },
				code: { S: code },
				ts: { N: String(now) },
				ttl: { N: String(ttl) },
				triggerSource: { S: event?.triggerSource ?? '' },
				sub: { S: sub },
			},
		}));
	}
}

function normalize(t) {
	// Cognito triggerSource values for custom senders:
	//   'CustomSMSSender_SignUp' / 'CustomEmailSender_ResendCode' / …
	const stripped = t.replace(/^custom(sms|email)sender_/, '');
	if (stripped.startsWith('authentication')) return 'mfa';
	if (stripped.startsWith('signup')) return 'signup';
	if (stripped.startsWith('resendcode')) return 'resend';
	if (stripped.startsWith('forgotpassword')) return 'forgot';
	if (stripped.startsWith('updateuserattribute') || stripped.startsWith('verifyuserattribute')) return 'verify-attribute';
	if (stripped.startsWith('admincreateuser')) return 'admin-create';
	if (stripped.startsWith('accounttakeover')) return 'ato';
	return stripped;
}
