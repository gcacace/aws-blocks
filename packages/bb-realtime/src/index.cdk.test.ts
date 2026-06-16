// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * CDK-side tests for Realtime synth guards.
 *
 * Validates that calling runtime data methods (publish/subscribe/getChannel)
 * on the CDK construct throws an actionable error instead of a cryptic
 * `X is not a function` TypeError.
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { Realtime } from './index.cdk.js';

test('CDK: calling a runtime method throws an actionable error (not a cryptic TypeError)', () => {
	// Unlike KVStore/DistributedTable tests which instantiate the construct directly,
	// Realtime's constructor requires complex shared infrastructure (WebSocket API,
	// DynamoDB connections table, AppSetting) that is impractical to stand up in a
	// unit test. We access the prototype directly instead — the synth-guard stubs
	// are plain methods and don't depend on instance state.
	for (const method of ['publish', 'subscribe', 'getChannel']) {
		assert.throws(
			() => (Realtime.prototype as any)[method]('arg'),
			/cannot be called during CDK synth/,
			`${method}() should throw the actionable synth-time error`,
		);
	}
});
