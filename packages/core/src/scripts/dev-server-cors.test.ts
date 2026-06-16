// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { resolveDevCorsOrigin, LOCALHOST_PATTERN } from './dev-server.js';

describe('resolveDevCorsOrigin — dev server CORS', () => {
  it('reflects localhost origin back as-is', () => {
    assert.strictEqual(resolveDevCorsOrigin('http://localhost:3000'), 'http://localhost:3000');
  });

  it('reflects 127.0.0.1 origin back as-is', () => {
    assert.strictEqual(resolveDevCorsOrigin('http://127.0.0.1:3000'), 'http://127.0.0.1:3000');
  });

  it('returns fallback http://localhost:3000 for non-localhost origin', () => {
    assert.strictEqual(resolveDevCorsOrigin('https://evil.com'), 'http://localhost:3000');
  });

  it('returns fallback http://localhost:3000 when origin is empty', () => {
    assert.strictEqual(resolveDevCorsOrigin(''), 'http://localhost:3000');
  });

  it('rejects subdomain impersonation (evil.localhost)', () => {
    assert.strictEqual(LOCALHOST_PATTERN.test('http://localhost.evil.com'), false);
    assert.strictEqual(resolveDevCorsOrigin('http://localhost.evil.com'), 'http://localhost:3000');
  });
});
