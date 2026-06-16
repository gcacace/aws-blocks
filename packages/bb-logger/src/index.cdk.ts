// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as logs from 'aws-cdk-lib/aws-logs';
import { RemovalPolicy } from 'aws-cdk-lib';
import { Scope, registerConfig } from '@aws-blocks/core/cdk';
import type { ScopeParent } from '@aws-blocks/core';
import type { LoggingOptions } from './types.js';

// Re-export public types and errors (no runtime dependencies)
export { LoggingErrors } from './errors.js';
export type { LogLevel, LoggingOptions, LogEntry, ChildLogger, RetentionDays } from './types.js';

/**
 * CDK construct for Logger. Optionally creates a CloudWatch Logs LogGroup
 * with a retention policy when `options.retention` is specified. Sets the
 * `LOG_LEVEL` environment variable on the shared Lambda handler when a
 * `level` is configured.
 *
 * When `retention` is omitted, no LogGroup is created — Lambda's auto-created
 * log group applies (logs never expire).
 *
 * When a LogGroup is created, it uses RemovalPolicy.DESTROY so that stack
 * teardown completes cleanly during E2E tests and cleanup scenarios.
 */
export class Logger extends Scope {
	constructor(scope: ScopeParent, id: string, options?: LoggingOptions) {
		super(id, { parent: scope });

		// Set global LOG_LEVEL config when level is configured
		if (options?.level) {
			registerConfig(this, 'LOG_LEVEL', options.level);
		}

		// Optionally create a LogGroup with retention
		if (options?.retention) {
			new logs.LogGroup(this, 'LogGroup', {
				logGroupName: `/aws/lambda/${this.handler.functionName}`,
				retention: options.retention,
				removalPolicy: RemovalPolicy.DESTROY,
			});
		}
	}
}
