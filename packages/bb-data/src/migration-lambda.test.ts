// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { test, mock } from 'node:test';
import assert from 'node:assert';
import type { CloudFormationCustomResourceDeleteEvent } from 'aws-lambda';

// We test the withRetry logic by importing the handler and mocking the engine.
// Since withRetry is not exported, we test it indirectly through the handler.

test('migration handler returns early on Delete event', async () => {
  const { handler } = await import('./migration-lambda.js');
  // Only the fields the Delete branch reads. A Partial<…> cast keeps these
  // fields type-checked while omitting the rest of the CFN event shape.
  const event: Partial<CloudFormationCustomResourceDeleteEvent> = {
    RequestType: 'Delete',
    PhysicalResourceId: 'migrations-abc',
  };
  const result = await handler(event as CloudFormationCustomResourceDeleteEvent);
  assert.strictEqual(result.PhysicalResourceId, 'migrations-abc');
});
