// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { test, describe } from 'node:test';
import assert from 'node:assert';
import { setTimeout } from 'node:timers/promises';
import type { api as apiType } from 'aws-blocks';

export function asyncJobTests(getApi: () => typeof apiType) {
  describe('AsyncJob BB', () => {
    test('AsyncJob - submit and verify handler execution', async () => {
      const api = getApi();
      const testId = Date.now().toString(36);
      const { jobId } = await api.asyncJobSubmit(`single-${testId}`, 'hello');
      assert.ok(typeof jobId === 'string');

      // Poll for handler completion (mock processes on next tick)
      let result = null;
      for (let i = 0; i < 20; i++) {
        result = await api.asyncJobGetResult(`single-${testId}`);
        if (result) break;
        await setTimeout(100);
      }

      assert.ok(result, 'handler should have written result');
      assert.strictEqual(result.value, 'hello');
      assert.strictEqual(result.jobId, jobId);
      assert.strictEqual(result.receiveCount, 1);
      assert.ok(result.sentAt);
    });

    test('AsyncJob - submitBatch and verify all handlers execute', async () => {
      const api = getApi();
      const testId = Date.now().toString(36);
      const items = [
        { key: `batch-${testId}-0`, value: 'a' },
        { key: `batch-${testId}-1`, value: 'b' },
        { key: `batch-${testId}-2`, value: 'c' },
      ];

      const { jobIds } = await api.asyncJobSubmitBatch(items);
      assert.strictEqual(jobIds.length, 3);

      // Poll for all three results
      for (let i = 0; i < 20; i++) {
        const results = await Promise.all(
          items.map(item => api.asyncJobGetResult(item.key))
        );
        if (results.every((r) => r !== null)) break;
        await setTimeout(100);
      }

      for (const item of items) {
        const result = await api.asyncJobGetResult(item.key);
        assert.ok(result, `handler should have written result for ${item.key}`);
        assert.strictEqual(result.value, item.value);
      }
    });

    test('AsyncJob - submit throws PayloadTooLarge', async () => {
      const api = getApi();
      await assert.rejects(
        () => api.asyncJobSubmitTooLarge(),
        /PayloadTooLargeException/
      );
    });

    test('AsyncJob - submitBatch throws BatchTooLarge', async () => {
      const api = getApi();
      await assert.rejects(
        () => api.asyncJobSubmitBatchTooMany(),
        /BatchTooLargeException/
      );
    });

    // Schema Validation Tests
    test('AsyncJob - submit valid payload with schema', async () => {
      const api = getApi();
      const { jobId } = await api.asyncJobSubmitValidated('alice@example.com', 'Welcome', 'Hello Alice');
      assert.ok(typeof jobId === 'string');

      // Poll for handler completion
      let result = null;
      for (let i = 0; i < 20; i++) {
        result = await api.asyncJobGetValidatedResult(jobId);
        if (result) break;
        await setTimeout(100);
      }

      assert.ok(result, 'handler should have written result');
      assert.strictEqual(result.to, 'alice@example.com');
      assert.strictEqual(result.subject, 'Welcome');
    });

    test('AsyncJob - submit invalid payload with schema throws ValidationFailed', async () => {
      const api = getApi();
      await assert.rejects(
        () => api.asyncJobSubmitValidated('not-an-email', 'Subject', 'Body'),
        /ValidationFailedException/
      );
    });

    test('AsyncJob - submitBatch with invalid payload in batch throws ValidationFailed', async () => {
      const api = getApi();
      await assert.rejects(
        () => api.asyncJobSubmitValidatedBatch([
          { to: 'alice@example.com', subject: 'Hi', body: 'Hello' },
          { to: 'bad-email', subject: 'Hi', body: 'Hello' },
        ]),
        /ValidationFailedException/
      );
    });

    // delaySeconds Tests
    test('AsyncJob - submit with delaySeconds defers execution', async () => {
      const api = getApi();
      const testId = Date.now().toString(36);
      const key = `delayed-${testId}`;

      await api.asyncJobSubmitDelayed(key, 'delayed-value', 2);

      // Should NOT be written yet
      const immediate = await api.asyncJobGetResult(key);
      assert.strictEqual(immediate, null, 'handler should not have run yet');

      // Wait for delay + processing
      await setTimeout(3000);

      let result = null;
      for (let i = 0; i < 10; i++) {
        result = await api.asyncJobGetResult(key);
        if (result) break;
        await setTimeout(200);
      }

      assert.ok(result, 'handler should have run after delay');
      assert.strictEqual(result.value, 'delayed-value');
    });

    test('AsyncJob - submitBatch with delaySeconds defers all executions', async () => {
      const api = getApi();
      const testId = Date.now().toString(36);
      const items = [
        { key: `batch-delayed-${testId}-0`, value: 'a' },
        { key: `batch-delayed-${testId}-1`, value: 'b' },
      ];

      await api.asyncJobSubmitBatchDelayed(items, 2);

      // Should NOT be written yet
      for (const item of items) {
        const immediate = await api.asyncJobGetResult(item.key);
        assert.strictEqual(immediate, null, `handler for ${item.key} should not have run yet`);
      }

      // Wait for delay + processing
      await setTimeout(3000);

      for (const item of items) {
        let result = null;
        for (let i = 0; i < 10; i++) {
          result = await api.asyncJobGetResult(item.key);
          if (result) break;
          await setTimeout(200);
        }
        assert.ok(result, `handler should have run for ${item.key}`);
        assert.strictEqual(result.value, item.value);
      }
    });
  });
}
