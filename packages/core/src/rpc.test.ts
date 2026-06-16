// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parseRpcRequest, RpcErrorCode } from './rpc.js';

describe('-32600 Invalid Request error shape', () => {
  it('returns proper JSON-RPC 2.0 envelope with error code', () => {
    const result = parseRpcRequest(JSON.stringify({ method: 'ns.method', id: 1 }));
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      const parsed = JSON.parse(result.response);
      assert.strictEqual(parsed.jsonrpc, '2.0');
      assert.strictEqual(parsed.error.code, RpcErrorCode.InvalidRequest);
      assert.strictEqual(parsed.id, 1);
    }
  });

  it('includes descriptive message with expected JSON-RPC 2.0 shape', () => {
    const result = parseRpcRequest(JSON.stringify({ method: 'test', id: 1 }));
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      const parsed = JSON.parse(result.response);
      assert.ok(
        parsed.error.message.includes('expected JSON-RPC 2.0'),
        `message should describe the expected format, got: ${parsed.error.message}`,
      );
      assert.ok(
        parsed.error.message.includes('"jsonrpc":"2.0"'),
        `message should echo the expected envelope shape`,
      );
    }
  });

  it('includes data.name per D-003 convention', () => {
    const result = parseRpcRequest(JSON.stringify({ method: 'test', id: 1 }));
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      const parsed = JSON.parse(result.response);
      assert.strictEqual(parsed.error.data.name, 'InvalidRequest');
    }
  });

  it('preserves the caller id in the error response', () => {
    const result = parseRpcRequest(JSON.stringify({ id: 'abc-123' }));
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      const parsed = JSON.parse(result.response);
      assert.strictEqual(parsed.id, 'abc-123');
    }
  });

  it('uses null id when request omits id', () => {
    const result = parseRpcRequest(JSON.stringify({ jsonrpc: '1.0', method: 123 }));
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      const parsed = JSON.parse(result.response);
      assert.strictEqual(parsed.id, null);
    }
  });

  it('includes data.name when method lacks namespace dot separator', () => {
    const result = parseRpcRequest(JSON.stringify({ jsonrpc: '2.0', method: 'noNamespace', id: 7 }));
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      const parsed = JSON.parse(result.response);
      assert.strictEqual(parsed.error.code, RpcErrorCode.InvalidRequest);
      assert.strictEqual(parsed.error.data.name, 'InvalidRequest');
      assert.strictEqual(parsed.id, 7);
    }
  });
});
