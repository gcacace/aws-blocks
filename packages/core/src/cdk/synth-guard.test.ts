// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { test } from 'node:test';
import assert from 'node:assert';
import { synthGuard } from './synth-guard.js';

test('synthGuard throws an error mentioning the class and method name', () => {
	assert.throws(
		() => synthGuard('MyBlock', 'doThing'),
		(err: Error) => {
			assert.match(err.message, /MyBlock\.doThing\(\) cannot be called during CDK synth/);
			assert.match(err.message, /--conditions=aws-runtime/);
			return true;
		},
	);
});

test('synthGuard always throws (return type is never)', () => {
	assert.throws(() => synthGuard('X', 'y'));
});
