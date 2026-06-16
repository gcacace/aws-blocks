// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * End-to-end test against a deployed BlocksBackend stack.
 *
 * Prerequisites:
 *   - `npm run deploy` has been run; cdk.outputs.json exists.
 *   - AWS creds with access to the deployed stack.
 *
 * Hits the deployed API Gateway directly to confirm the BlocksBackend
 * Construct works the same way BlocksStack does once wired up.
 */
import { test, describe, before } from 'node:test';
import assert from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = join(__dirname, '..');
const OUTPUTS = join(APP_ROOT, 'cdk.outputs.json');

let apiUrl: string;

async function call(method: string, args: unknown[]) {
  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ apiNamespace: 'api', method, args }),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

describe('extending-blocks-guide-blocksbackend e2e', () => {
  before(() => {
    if (!existsSync(OUTPUTS)) {
      throw new Error(
        `${OUTPUTS} not found. Run 'npm run deploy' inside the test-app first.`
      );
    }
    const raw = JSON.parse(readFileSync(OUTPUTS, 'utf-8'));
    const stackKey = Object.keys(raw)[0];
    apiUrl = raw[stackKey].ApiUrl;
    assert.ok(apiUrl, 'ApiUrl missing from outputs');
  });

  test('BlocksBackend health check returns ok', async () => {
    const result = await call('health', []);
    assert.deepStrictEqual(result, { ok: true, via: 'BlocksBackend' });
  });

  test('Pattern 1 via BlocksBackend: enqueue to user-owned SQS', async () => {
    const result = await call('pattern1Enqueue', [{ via: 'blocksbackend', ts: Date.now() }]);
    assert.deepStrictEqual(result, { ok: true });
  });
});
