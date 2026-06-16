// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { SQSClient, SendMessageCommand, SendMessageBatchCommand } from '@aws-sdk/client-sqs';
import { Scope, registerSdkIdentifiers, getSdkIdentifiers } from '@aws-blocks/core';
import { EventSourceMapping } from '@aws-blocks/core/bb-utils';
import type { ScopeParent } from '@aws-blocks/core';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import type {
	AsyncJobContext,
	AsyncJobOptions,
	SubmitOptions,
	BatchSubmitResult,
} from './types.js';
import { AsyncJobErrors } from './errors.js';
import { BB_NAME, BB_VERSION } from './version.js';
import { Logger } from '@aws-blocks/bb-logger';
import type { ChildLogger } from '@aws-blocks/bb-logger';

export { AsyncJobErrors } from './errors.js';
export type { AsyncJobContext, AsyncJobOptions, SubmitOptions, BatchSubmitResult } from './types.js';

const MAX_PAYLOAD_BYTES = 256 * 1024;
const MAX_BATCH_SIZE = 10;

export class AsyncJob<T = unknown> extends Scope {
	private _handler: (payload: T, context: AsyncJobContext) => Promise<void>;
	private _schema?: StandardSchemaV1<T>;
	private _envKey: string;
	private _id: string;
	private _sqsClient: SQSClient;

	/** @internal Logger for internal operations. Defaults to error-level when not provided. */
	protected log: ChildLogger;

	constructor(scope: ScopeParent, id: string, options: AsyncJobOptions<T>) {
		super(id, { parent: scope, bbName: BB_NAME, bbVersion: BB_VERSION });
		this.log = options?.logger ?? new Logger(this, 'logger', { level: 'error' });
		this._handler = options.handler;
		this._schema = options.schema;
		this._id = id;
		this._sqsClient = new SQSClient({
			customUserAgent: this.buildUserAgentChain(),
		});

		const envKey = `BLOCKS_QUEUE_URL_${this.fullId.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
		const queueUrl = process.env[envKey] ?? '';
		this._envKey = envKey;

		registerSdkIdentifiers(this.fullId, { queueUrl });

		// Only register handler if queue URL is available (i.e., running in Lambda, not codegen)
		if (queueUrl) {
			const queueName = queueUrl.split('/').pop()!;
			this.registerLambdaEventHandler(EventSourceMapping.SQS, queueName, (record) => this._processRecord(record));
		}
	}

	/** Ensures queue URL is available, throws descriptive error if not */
	private ensureQueueUrl(): void {
		if (!getSdkIdentifiers(this).queueUrl) {
			throw new Error(
				`AsyncJob "${this._id}": missing required environment variable "${this._envKey}". ` +
				`Ensure the CDK stack has been deployed and the Lambda environment is configured correctly.`
			);
		}
	}

	/** Process an SQS record — called by the Lambda handler */
	private async _processRecord(record: {
		messageId: string;
		body: string;
		attributes: { ApproximateReceiveCount: string; SentTimestamp: string };
	}): Promise<void> {
		const payload = JSON.parse(record.body) as T;
		const ctx: AsyncJobContext = {
			jobId: record.messageId,
			receiveCount: parseInt(record.attributes.ApproximateReceiveCount, 10),
			sentAt: new Date(parseInt(record.attributes.SentTimestamp, 10)).toISOString(),
		};
		await this._handler(payload, ctx);
	}

	/** Validates payload and returns the serialized JSON string for reuse */
	private async validatePayload(payload: T): Promise<string> {
		if (this._schema) {
			const rawResult = this._schema['~standard'].validate(payload);
			const result = rawResult instanceof Promise ? await rawResult : rawResult;
			if (result && typeof result === 'object' && 'issues' in result && result.issues) {
				const msg = result.issues[0]?.message ?? 'Validation failed';
				const err = new Error(`${AsyncJobErrors.ValidationFailed}: ${msg}`);
				err.name = AsyncJobErrors.ValidationFailed;
				throw err;
			}
		}

		const serialized = JSON.stringify(payload);
		const bytes = Buffer.byteLength(serialized, 'utf8');
		if (bytes > MAX_PAYLOAD_BYTES) {
			const kb = Math.ceil(bytes / 1024);
			const err = new Error(
				`${AsyncJobErrors.PayloadTooLarge}: Serialized payload is ${kb} KB, exceeds 256 KB limit`
			);
			err.name = AsyncJobErrors.PayloadTooLarge;
			throw err;
		}

		return serialized;
	}

	async submit(payload: T, options?: SubmitOptions): Promise<{ jobId: string }> {
		this.ensureQueueUrl();
		const messageBody = await this.validatePayload(payload);

		const result = await this._sqsClient.send(new SendMessageCommand({
			QueueUrl: getSdkIdentifiers(this).queueUrl,
			MessageBody: messageBody,
			DelaySeconds: options?.delaySeconds ?? 0,
		}));

		const jobId = result.MessageId;
		if (!jobId) {
			throw new Error('SQS SendMessage succeeded but returned no MessageId');
		}

		return { jobId };
	}

	async submitBatch(payloads: T[], options?: SubmitOptions): Promise<BatchSubmitResult> {
		this.ensureQueueUrl();

		if (payloads.length === 0) {
			const err = new Error(
				`${AsyncJobErrors.BatchEmpty}: Batch is empty, must contain at least 1 payload`
			);
			err.name = AsyncJobErrors.BatchEmpty;
			throw err;
		}

		if (payloads.length > MAX_BATCH_SIZE) {
			const err = new Error(
				`${AsyncJobErrors.BatchTooLarge}: Batch contains ${payloads.length} payloads, maximum is ${MAX_BATCH_SIZE}`
			);
			err.name = AsyncJobErrors.BatchTooLarge;
			throw err;
		}

		const messageBodies: string[] = [];
		for (const payload of payloads) {
			messageBodies.push(await this.validatePayload(payload));
		}

		const result = await this._sqsClient.send(new SendMessageBatchCommand({
			QueueUrl: getSdkIdentifiers(this).queueUrl,
			Entries: messageBodies.map((body, i) => ({
				Id: String(i),
				MessageBody: body,
				DelaySeconds: options?.delaySeconds ?? 0,
			})),
		}));

		const idMap = new Map(result.Successful?.map(s => [s.Id!, s.MessageId!]) ?? []);
		const failed: BatchSubmitResult['failed'] = (result.Failed ?? []).map(f => ({
			index: parseInt(f.Id!, 10),
			code: f.Code ?? 'UnknownError',
			message: f.Message ?? 'Unknown error',
		}));

		const failedIndexes = new Set(failed.map(f => f.index));
		const jobIds: Array<string | null> = payloads.map((_, i) =>
			failedIndexes.has(i) ? null : (idMap.get(String(i)) ?? null)
		);

		if (failed.length > 0) {
			const err = new Error(
				`${AsyncJobErrors.BatchSubmitFailed}: ${failed.length} of ${payloads.length} messages failed to send`
			);
			err.name = AsyncJobErrors.BatchSubmitFailed;
			(err as any).failed = failed;
			(err as any).jobIds = jobIds;
			throw err;
		}

		return { jobIds, failed: [] };
	}
}
