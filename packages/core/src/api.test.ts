// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { test } from 'node:test';
import assert from 'node:assert';
import { ApiNamespace, API_NAMESPACE_MARKER } from './api.js';
import { Scope } from './common/index.js';

const scope = new Scope('test');

test('ApiNamespace stores name via marker symbol', () => {
  const api1 = new ApiNamespace(scope, 'myapi', (ctx) => ({
    test: () => 'hello'
  }));
  
  assert.strictEqual((api1 as any)[API_NAMESPACE_MARKER], 'myapi');
});

test('Different ApiNamespace names should not collide', () => {
  const api1 = new ApiNamespace(scope, 'api1', (ctx) => ({ test: () => 'a' }));
  const api2 = new ApiNamespace(scope, 'api2', (ctx) => ({ test: () => 'b' }));
  
  assert.strictEqual((api1 as any)[API_NAMESPACE_MARKER], 'api1');
  assert.strictEqual((api2 as any)[API_NAMESPACE_MARKER], 'api2');
});
