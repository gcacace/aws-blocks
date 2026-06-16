// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { Scope, registerSdkIdentifiers } from '@aws-blocks/core';
import type { ScopeParent } from '@aws-blocks/core';
import type {
	CronJobEvent,
	CronJobOptions,
} from './types.js';
import { CronJobErrors } from './errors.js';
import { BB_NAME, BB_VERSION } from './version.js';
import { Logger } from '@aws-blocks/bb-logger';
import type { ChildLogger } from '@aws-blocks/bb-logger';

export { CronJobErrors } from './errors.js';
export type { CronJobEvent, CronJobOptions } from './types.js';

export class CronJob<T = void> extends Scope {
	/** @internal Logger for internal operations. Defaults to error-level when not provided. */
	protected log: ChildLogger;

	constructor(scope: ScopeParent, id: string, options: CronJobOptions<T>) {
		super(id, { parent: scope, bbName: BB_NAME, bbVersion: BB_VERSION });
		this.log = options?.logger ?? new Logger(this, 'logger', { level: 'error' });
		registerSdkIdentifiers(this.fullId, { scheduleName: `${this.fullId}`.substring(0, 64) });

		// Register via the same mechanism as AsyncJob (SQS)
		this.registerLambdaEventHandler('blocks.cronjob', this.fullId, async (event) => {
			await options.handler({
				scheduledTime: event.scheduledTime ?? new Date().toISOString(),
				jobName: event.jobName,
				input: event.input,
			});
		});
	}
}
