// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  compilePath,
  registerRoute,
  matchRoute,
  getRegisteredRoutes,
  clearRouteRegistry,
  lockRouteRegistry,
  unlockRouteRegistry,
  RawRouteErrors,
  derivePathFromScope,
  resolveRoutePath,
} from './raw-route.js';
import type { BlocksContext } from './api.js';

const noop = async (_ctx: BlocksContext) => {};

/** Create a null-prototype object for comparing with params from matchRoute. */
function nullProto(obj: Record<string, string>): Record<string, string> {
  return Object.assign(Object.create(null), obj);
}

// Ensure clean slate before every test across all describe blocks
beforeEach(() => {
  clearRouteRegistry();
});

// ── compilePath ─────────────────────────────────────────────────────────────

describe('compilePath', () => {
  it('compiles exact path', () => {
    const { pattern, paramNames } = compilePath('/health');
    assert.deepStrictEqual(paramNames, []);
    assert.ok(pattern.test('/health'));
    assert.ok(!pattern.test('/health/'));
    assert.ok(!pattern.test('/'));
    assert.ok(!pattern.test('/healthz'));
  });

  it('compiles root path', () => {
    const { pattern, paramNames } = compilePath('/');
    assert.deepStrictEqual(paramNames, []);
    assert.ok(pattern.test('/'));
    assert.ok(!pattern.test('/anything'));
  });

  it('compiles single named parameter', () => {
    const { pattern, paramNames } = compilePath('/users/{id}');
    assert.deepStrictEqual(paramNames, ['id']);
    const match = pattern.exec('/users/123');
    assert.ok(match);
    assert.strictEqual(match[1], '123');
    assert.ok(!pattern.test('/users/'));
    assert.ok(!pattern.test('/users'));
    assert.ok(!pattern.test('/users/123/extra'));
  });

  it('compiles multiple named parameters', () => {
    const { pattern, paramNames } = compilePath('/orgs/{orgId}/members/{memberId}');
    assert.deepStrictEqual(paramNames, ['orgId', 'memberId']);
    const match = pattern.exec('/orgs/acme/members/alice');
    assert.ok(match);
    assert.strictEqual(match[1], 'acme');
    assert.strictEqual(match[2], 'alice');
  });

  it('compiles wildcard path', () => {
    const { pattern, paramNames } = compilePath('/v1/*');
    assert.deepStrictEqual(paramNames, ['*']);
    const match = pattern.exec('/v1/anything/deep/nested');
    assert.ok(match);
    assert.strictEqual(match[1], 'anything/deep/nested');
    // With (.*), /v1/ matches with empty wildcard capture
    const emptyMatch = pattern.exec('/v1/');
    assert.ok(emptyMatch);
    assert.strictEqual(emptyMatch[1], '');
    assert.ok(!pattern.test('/v1'));
  });

  it('compiles path with named param followed by wildcard', () => {
    const { pattern, paramNames } = compilePath('/api/{version}/*');
    assert.deepStrictEqual(paramNames, ['version', '*']);
    const match = pattern.exec('/api/v2/users/list');
    assert.ok(match);
    assert.strictEqual(match[1], 'v2');
    assert.strictEqual(match[2], 'users/list');
  });

  it('escapes regex-special characters in path', () => {
    const { pattern } = compilePath('/file.json');
    assert.ok(pattern.test('/file.json'));
    assert.ok(!pattern.test('/fileXjson'));
  });
});

// ── registerRoute + getRegisteredRoutes ─────────────────────────────────────

describe('registerRoute', () => {
  it('registers a route', () => {
    registerRoute({ method: 'GET', path: '/health', handler: noop });
    const routes = getRegisteredRoutes();
    assert.strictEqual(routes.length, 1);
    assert.strictEqual(routes[0].method, 'GET');
    assert.strictEqual(routes[0].path, '/health');
  });

  it('registers multiple distinct routes', () => {
    registerRoute({ method: 'GET', path: '/a', handler: noop });
    registerRoute({ method: 'POST', path: '/a', handler: noop });
    registerRoute({ method: 'GET', path: '/b', handler: noop });
    assert.strictEqual(getRegisteredRoutes().length, 3);
  });

  it('throws DuplicateRouteException for same method+path', () => {
    registerRoute({ method: 'GET', path: '/health', handler: noop });
    assert.throws(
      () => registerRoute({ method: 'GET', path: '/health', handler: noop }),
      (err: Error) => {
        assert.strictEqual(err.name, RawRouteErrors.DuplicateRoute);
        return true;
      },
    );
  });

  it('allows same path with different methods (no duplicate)', () => {
    registerRoute({ method: 'GET', path: '/users', handler: noop });
    registerRoute({ method: 'POST', path: '/users', handler: noop });
    assert.strictEqual(getRegisteredRoutes().length, 2);
  });

  it('throws DuplicateRouteException when trailing-slash variant is registered second', () => {
    registerRoute({ method: 'GET', path: '/health', handler: noop });
    assert.throws(
      () => registerRoute({ method: 'GET', path: '/health/', handler: noop }),
      (err: Error) => {
        assert.strictEqual(err.name, RawRouteErrors.DuplicateRoute);
        return true;
      },
    );
  });

  it('throws DuplicateRouteException when non-trailing-slash variant is registered second', () => {
    registerRoute({ method: 'GET', path: '/health/', handler: noop });
    assert.throws(
      () => registerRoute({ method: 'GET', path: '/health', handler: noop }),
      (err: Error) => {
        assert.strictEqual(err.name, RawRouteErrors.DuplicateRoute);
        return true;
      },
    );
  });

  it('throws DuplicateRouteException for paths differing only by double slashes', () => {
    registerRoute({ method: 'POST', path: '/api/users', handler: noop });
    assert.throws(
      () => registerRoute({ method: 'POST', path: '/api//users', handler: noop }),
      (err: Error) => {
        assert.strictEqual(err.name, RawRouteErrors.DuplicateRoute);
        return true;
      },
    );
  });

  it('stores normalized path in registry (no trailing slash)', () => {
    registerRoute({ method: 'GET', path: '/items/', handler: noop });
    const routes = getRegisteredRoutes();
    assert.strictEqual(routes[0].path, '/items');
  });
});

// ── matchRoute ──────────────────────────────────────────────────────────────

describe('matchRoute', () => {
  it('matches exact path', () => {
    registerRoute({ method: 'GET', path: '/health', handler: noop });
    const result = matchRoute('GET', '/health');
    assert.ok(result);
    assert.deepStrictEqual(result.params, nullProto({}));
    assert.strictEqual(result.route.path, '/health');
  });

  it('returns null for non-matching path', () => {
    registerRoute({ method: 'GET', path: '/health', handler: noop });
    assert.strictEqual(matchRoute('GET', '/other'), null);
  });

  it('returns null for non-matching method', () => {
    registerRoute({ method: 'GET', path: '/health', handler: noop });
    assert.strictEqual(matchRoute('POST', '/health'), null);
  });

  it('extracts named params', () => {
    registerRoute({ method: 'GET', path: '/users/{id}', handler: noop });
    const result = matchRoute('GET', '/users/42');
    assert.ok(result);
    assert.deepStrictEqual(result.params, nullProto({ id: '42' }));
  });

  it('extracts multiple named params', () => {
    registerRoute({ method: 'GET', path: '/orgs/{orgId}/members/{memberId}', handler: noop });
    const result = matchRoute('GET', '/orgs/acme/members/bob');
    assert.ok(result);
    assert.deepStrictEqual(result.params, nullProto({ orgId: 'acme', memberId: 'bob' }));
  });

  it('extracts wildcard param', () => {
    registerRoute({ method: 'GET', path: '/files/*', handler: noop });
    const result = matchRoute('GET', '/files/docs/readme.md');
    assert.ok(result);
    assert.deepStrictEqual(result.params, nullProto({ '*': 'docs/readme.md' }));
  });

  it('decodes URI-encoded path segments', () => {
    registerRoute({ method: 'GET', path: '/users/{name}', handler: noop });
    const result = matchRoute('GET', '/users/John%20Doe');
    assert.ok(result);
    assert.deepStrictEqual(result.params, nullProto({ name: 'John Doe' }));
  });

  it('matches first registered route when multiple could match', () => {
    const handler1 = async (ctx: BlocksContext) => { ctx.response.send('first'); };
    const handler2 = async (ctx: BlocksContext) => { ctx.response.send('second'); };
    registerRoute({ method: 'GET', path: '/users/{id}', handler: handler1 });
    registerRoute({ method: 'GET', path: '/users/*', handler: handler2 });
    const result = matchRoute('GET', '/users/42');
    assert.ok(result);
    assert.strictEqual(result.route.handler, handler1);
  });
});

// ── clearRouteRegistry ──────────────────────────────────────────────────────

describe('clearRouteRegistry', () => {
  it('removes all registered routes', () => {
    registerRoute({ method: 'GET', path: '/a', handler: noop });
    registerRoute({ method: 'POST', path: '/b', handler: noop });
    assert.strictEqual(getRegisteredRoutes().length, 2);
    clearRouteRegistry();
    assert.strictEqual(getRegisteredRoutes().length, 0);
  });
});

// ── RawRouteErrors ──────────────────────────────────────────────────────────

describe('RawRouteErrors', () => {
  it('has DuplicateRoute error constant', () => {
    assert.strictEqual(RawRouteErrors.DuplicateRoute, 'DuplicateRouteException');
  });
});

// ── FIX 1: Path traversal via wildcard decoding ─────────────────────────────

describe('path traversal prevention', () => {
  it('wildcard params are NOT decoded (%2F stays as %2F)', () => {
    registerRoute({ method: 'GET', path: '/files/*', handler: noop });
    const result = matchRoute('GET', '/files/..%2F..%2Fetc%2Fpasswd');
    assert.ok(result);
    assert.strictEqual(result.params['*'], '..%2F..%2Fetc%2Fpasswd');
  });

  it('named params ARE decoded (%20 → space)', () => {
    registerRoute({ method: 'GET', path: '/users/{name}', handler: noop });
    const result = matchRoute('GET', '/users/John%20Doe');
    assert.ok(result);
    assert.strictEqual(result.params.name, 'John Doe');
  });

  it('invalid percent encoding does not crash (graceful fallback)', () => {
    registerRoute({ method: 'GET', path: '/items/{id}', handler: noop });
    const result = matchRoute('GET', '/items/%ZZ');
    assert.ok(result);
    assert.strictEqual(result.params.id, '%ZZ');
  });
});

// ── FIX 2: Wildcard matches empty path ──────────────────────────────────────

describe('wildcard empty path matching', () => {
  it('/files/* matches /files/ (empty wildcard → "")', () => {
    registerRoute({ method: 'GET', path: '/files/*', handler: noop });
    const result = matchRoute('GET', '/files/');
    assert.ok(result);
    assert.strictEqual(result.params['*'], '');
  });

  it('/files/* matches /files/readme.md (normal wildcard)', () => {
    registerRoute({ method: 'GET', path: '/files/*', handler: noop });
    const result = matchRoute('GET', '/files/readme.md');
    assert.ok(result);
    assert.strictEqual(result.params['*'], 'readme.md');
  });

  it('/files/* does NOT match /files (no trailing slash, no wildcard segment)', () => {
    registerRoute({ method: 'GET', path: '/files/*', handler: noop });
    const result = matchRoute('GET', '/files');
    assert.strictEqual(result, null);
  });
});

// ── FIX 3: Registry lock ────────────────────────────────────────────────────

describe('registry lock', () => {
  it('registerRoute() after lockRouteRegistry() throws', () => {
    lockRouteRegistry();
    assert.throws(
      () => registerRoute({ method: 'GET', path: '/locked', handler: noop }),
      (err: Error) => {
        assert.ok(err.message.includes('Cannot register routes after handler creation'));
        return true;
      },
    );
  });

  it('clearRouteRegistry() unlocks registration', () => {
    lockRouteRegistry();
    clearRouteRegistry();
    assert.doesNotThrow(() => {
      registerRoute({ method: 'GET', path: '/unlocked', handler: noop });
    });
  });

  it('unlockRouteRegistry() re-allows registration', () => {
    lockRouteRegistry();
    unlockRouteRegistry();
    assert.doesNotThrow(() => {
      registerRoute({ method: 'GET', path: '/unlocked2', handler: noop });
    });
  });
});

// ── FIX 4: Path normalization ───────────────────────────────────────────────

describe('path normalization', () => {
  it('/health/ matches route registered as /health', () => {
    registerRoute({ method: 'GET', path: '/health', handler: noop });
    const result = matchRoute('GET', '/health/');
    assert.ok(result);
    assert.strictEqual(result.route.path, '/health');
  });

  it('/a//b matches route registered as /a/b', () => {
    registerRoute({ method: 'GET', path: '/a/b', handler: noop });
    const result = matchRoute('GET', '/a//b');
    assert.ok(result);
    assert.strictEqual(result.route.path, '/a/b');
  });

  it('compilePath normalizes double slashes', () => {
    const { pattern } = compilePath('/a//b');
    assert.ok(pattern.test('/a/b'));
  });

  it('compilePath removes trailing slash', () => {
    const { pattern } = compilePath('/health/');
    assert.ok(pattern.test('/health'));
  });

  it('path without leading / throws in compilePath', () => {
    assert.throws(
      () => compilePath('health'),
      (err: Error) => {
        assert.ok(err.message.includes('Path must start with /'));
        return true;
      },
    );
  });
});

// ── FIX 5: Runtime HTTP method validation ───────────────────────────────────

describe('HTTP method validation', () => {
  it('rejects invalid HTTP method', () => {
    assert.throws(
      () => registerRoute({ method: 'INVALID' as any, path: '/test', handler: noop }),
      (err: Error) => {
        assert.ok(err.message.includes('Invalid HTTP method: INVALID'));
        return true;
      },
    );
  });

  it('accepts all valid HTTP methods', () => {
    const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'] as const;
    methods.forEach((method, i) => {
      assert.doesNotThrow(() => {
        registerRoute({ method, path: `/m${i}`, handler: noop });
      });
    });
  });
});

// ── FIX 6: Reserve /aws-blocks namespace ────────────────────────────────────

describe('/aws-blocks namespace reservation', () => {
  it('registering /aws-blocks/api throws', () => {
    assert.throws(
      () => registerRoute({ method: 'GET', path: '/aws-blocks/api', handler: noop }),
      (err: Error) => {
        assert.ok(err.message.includes('reserved for RPC dispatch'));
        return true;
      },
    );
  });

  it('registering /aws-blocks/api/foo throws', () => {
    assert.throws(
      () => registerRoute({ method: 'GET', path: '/aws-blocks/api/foo', handler: noop }),
      (err: Error) => {
        assert.ok(err.message.includes('reserved for RPC dispatch'));
        return true;
      },
    );
  });

  it('registering /aws-blocks/api/ (trailing slash) throws', () => {
    assert.throws(
      () => registerRoute({ method: 'GET', path: '/aws-blocks/api/', handler: noop }),
      (err: Error) => {
        assert.ok(err.message.includes('reserved for RPC dispatch'));
        return true;
      },
    );
  });

  it('rejects /AWS-BLOCKS/API (case-insensitive)', () => {
    assert.throws(
      () => registerRoute({ method: 'GET', path: '/AWS-BLOCKS/API', handler: noop }),
      (err: Error) => {
        assert.ok(err.message.includes('reserved for RPC dispatch'));
        return true;
      },
    );
  });

  it('rejects /Aws-Blocks/Api/foo (mixed case)', () => {
    assert.throws(
      () => registerRoute({ method: 'GET', path: '/Aws-Blocks/Api/foo', handler: noop }),
      (err: Error) => {
        assert.ok(err.message.includes('reserved for RPC dispatch'));
        return true;
      },
    );
  });

  it('rejects /aWs-bLoCks/ApI/ (case-insensitive with trailing slash)', () => {
    assert.throws(
      () => registerRoute({ method: 'GET', path: '/aWs-bLoCks/ApI/', handler: noop }),
      (err: Error) => {
        assert.ok(err.message.includes('reserved for RPC dispatch'));
        return true;
      },
    );
  });

  it('allows /aws-blocks/dashboard (not under /aws-blocks/api)', () => {
    assert.doesNotThrow(() => {
      registerRoute({ method: 'GET', path: '/aws-blocks/dashboard', handler: noop });
    });
  });

  it('allows /aws-blocks/health (not under /aws-blocks/api)', () => {
    assert.doesNotThrow(() => {
      registerRoute({ method: 'GET', path: '/aws-blocks/health', handler: noop });
    });
  });

  it('rejects /aws-blocks (exact namespace path)', () => {
    assert.throws(
      () => registerRoute({ method: 'POST', path: '/aws-blocks', handler: noop }),
      (err: Error) => {
        assert.ok(err.message.includes('reserved for RPC dispatch'));
        return true;
      },
    );
  });

  it('rejects /AWS-BLOCKS (case-insensitive namespace)', () => {
    assert.throws(
      () => registerRoute({ method: 'GET', path: '/AWS-BLOCKS', handler: noop }),
      (err: Error) => {
        assert.ok(err.message.includes('reserved for RPC dispatch'));
        return true;
      },
    );
  });

  it('allows /aws-blocksary (not the reserved prefix)', () => {
    assert.doesNotThrow(() => {
      registerRoute({ method: 'GET', path: '/aws-blocksary', handler: noop });
    });
  });

  it('allows /aws-blocks/api-docs (not exactly /aws-blocks/api)', () => {
    assert.doesNotThrow(() => {
      registerRoute({ method: 'GET', path: '/aws-blocks/api-docs', handler: noop });
    });
  });
});

// ── FIX 3 (review): Root path rejection ─────────────────────────────────────

describe('root path rejection', () => {
  it("registering '/' throws", () => {
    assert.throws(
      () => registerRoute({ method: 'GET', path: '/', handler: noop }),
      (err: Error) => {
        assert.ok(err.message.includes('root path is not supported'));
        return true;
      },
    );
  });

  it("registering '//' (normalizes to '/') throws", () => {
    assert.throws(
      () => registerRoute({ method: 'GET', path: '//', handler: noop }),
      (err: Error) => {
        assert.ok(err.message.includes('root path is not supported'));
        return true;
      },
    );
  });
});

// ── FIX 5 (review): Unclosed brace validation ──────────────────────────────

describe('malformed path patterns', () => {
  it("unclosed brace '/users/{id' throws", () => {
    assert.throws(
      () => compilePath('/users/{id'),
      (err: Error) => {
        assert.ok(err.message.includes("Unclosed '{'"));
        return true;
      },
    );
  });

  it("stray closing brace '/users/id}' throws", () => {
    assert.throws(
      () => compilePath('/users/id}'),
      (err: Error) => {
        assert.ok(err.message.includes("Unexpected '}'"));
        return true;
      },
    );
  });

  it("multiple unclosed braces '/a/{x/b/{y' throws", () => {
    assert.throws(
      () => compilePath('/a/{x/b/{y'),
      (err: Error) => {
        assert.ok(err.message.includes("Unclosed '{'"));
        return true;
      },
    );
  });

  it("well-formed braces still work '/users/{id}/posts/{postId}'", () => {
    const { pattern, paramNames } = compilePath('/users/{id}/posts/{postId}');
    assert.deepStrictEqual(paramNames, ['id', 'postId']);
    assert.ok(pattern.test('/users/1/posts/2'));
  });
});

// ── Verify #2: Path separator injection ─────────────────────────────────────

describe('path separator injection', () => {
  it('named param regex rejects literal / in segment', () => {
    registerRoute({ method: 'GET', path: '/users/{id}', handler: noop });
    const result = matchRoute('GET', '/users/foo/bar');
    assert.strictEqual(result, null, 'Should not match — / is not allowed in named param');
  });

  it('encoded %2F in URL does not become / before regex match', () => {
    registerRoute({ method: 'GET', path: '/users/{id}', handler: noop });
    const result = matchRoute('GET', '/users/foo%2Fbar');
    assert.ok(result, 'Should match — %2F is not a literal /');
    assert.strictEqual(result.params.id, 'foo/bar', 'Decoded value should contain /');
  });
});

// ── Verify #8: Double encoding bypass ───────────────────────────────────────

describe('double encoding bypass', () => {
  it('%252F decodes to %2F (not /), no path traversal', () => {
    registerRoute({ method: 'GET', path: '/users/{id}', handler: noop });
    const result = matchRoute('GET', '/users/%252F');
    assert.ok(result, 'Should match — %252F is a valid segment');
    assert.strictEqual(result.params.id, '%2F', 'Single decode of %252F yields %2F');
  });
});

// ── Parameter name validation ───────────────────────────────────────────────

describe('parameter name validation', () => {
  it('rejects empty braces {}', () => {
    assert.throws(
      () => compilePath('/users/{}'),
      (err: Error) => {
        assert.ok(err.message.includes("Invalid parameter name ''"));
        return true;
      },
    );
  });

  it('rejects numeric start {123}', () => {
    assert.throws(
      () => compilePath('/users/{123}'),
      (err: Error) => {
        assert.ok(err.message.includes("Invalid parameter name '123'"));
        return true;
      },
    );
  });

  it('rejects dashes {my-param}', () => {
    assert.throws(
      () => compilePath('/users/{my-param}'),
      (err: Error) => {
        assert.ok(err.message.includes("Invalid parameter name 'my-param'"));
        return true;
      },
    );
  });

  it('rejects spaces {with spaces}', () => {
    assert.throws(
      () => compilePath('/users/{with spaces}'),
      (err: Error) => {
        assert.ok(err.message.includes("Invalid parameter name 'with spaces'"));
        return true;
      },
    );
  });

  it('accepts valid name {id}', () => {
    const { paramNames } = compilePath('/users/{id}');
    assert.deepStrictEqual(paramNames, ['id']);
  });

  it('accepts underscore prefix {_private}', () => {
    const { paramNames } = compilePath('/users/{_private}');
    assert.deepStrictEqual(paramNames, ['_private']);
  });

  it('accepts alphanumeric {userId123}', () => {
    const { paramNames } = compilePath('/users/{userId123}');
    assert.deepStrictEqual(paramNames, ['userId123']);
  });
});

// ── Multiple wildcards validation ───────────────────────────────────────────

describe('multiple wildcards validation', () => {
  it('rejects multiple wildcards /a/*/b/*', () => {
    assert.throws(
      () => compilePath('/a/*/b/*'),
      (err: Error) => {
        assert.ok(err.message.includes('multiple wildcards'));
        return true;
      },
    );
  });

  it('rejects middle wildcard /a/*/b', () => {
    assert.throws(
      () => compilePath('/a/*/b'),
      (err: Error) => {
        assert.ok(err.message.includes('must be the last segment'));
        return true;
      },
    );
  });

  it('trailing wildcard /v1/* still works', () => {
    const { pattern, paramNames } = compilePath('/v1/*');
    assert.deepStrictEqual(paramNames, ['*']);
    const match = pattern.exec('/v1/anything/deep');
    assert.ok(match);
    assert.strictEqual(match[1], 'anything/deep');
  });

  it('registerRoute rejects multiple wildcards', () => {
    assert.throws(
      () => registerRoute({ method: 'GET', path: '/a/*/b/*', handler: noop }),
      (err: Error) => {
        assert.ok(err.message.includes('multiple wildcards'));
        return true;
      },
    );
  });

  it('registerRoute rejects middle wildcard', () => {
    assert.throws(
      () => registerRoute({ method: 'GET', path: '/a/*/b', handler: noop }),
      (err: Error) => {
        assert.ok(err.message.includes('must be the last segment'));
        return true;
      },
    );
  });
});

// ── FIX 7: Prototype pollution prevention ───────────────────────────────────

describe('prototype pollution prevention', () => {
  it('rejects __proto__ as param name at registration', () => {
    assert.throws(
      () => compilePath('/users/{__proto__}'),
      (err: Error) => {
        assert.ok(err.message.includes("'__proto__' is reserved"));
        return true;
      },
    );
  });

  it('rejects constructor as param name at registration', () => {
    assert.throws(
      () => compilePath('/users/{constructor}'),
      (err: Error) => {
        assert.ok(err.message.includes("'constructor' is reserved"));
        return true;
      },
    );
  });

  it('rejects prototype as param name at registration', () => {
    assert.throws(
      () => compilePath('/users/{prototype}'),
      (err: Error) => {
        assert.ok(err.message.includes("'prototype' is reserved"));
        return true;
      },
    );
  });

  it('registerRoute rejects __proto__ param', () => {
    assert.throws(
      () => registerRoute({ method: 'GET', path: '/users/{__proto__}', handler: noop }),
      (err: Error) => {
        assert.ok(err.message.includes("'__proto__' is reserved"));
        return true;
      },
    );
  });

  it('params object has no prototype chain', () => {
    registerRoute({ method: 'GET', path: '/users/{id}', handler: noop });
    const result = matchRoute('GET', '/users/42');
    assert.ok(result);
    assert.deepStrictEqual(Object.keys(result.params), ['id']);
    assert.strictEqual(Object.getPrototypeOf(result.params), null);
  });
});

// ── Scope-chain path derivation ─────────────────────────────────────────────

describe('derivePathFromScope', () => {
  // Chain model: root → topScope → [childScopes...] → RawRoute
  // root = sentinel { id } (no parent) — the BlocksStack
  // topScope = user's top-level Scope (parent = root) — excluded from path
  // childScopes = intermediate scopes — included in path

  const root = { id: 'stack' };
  const topScope = { id: 'my-app', parent: root };

  it('direct child of top-level scope → /{id}', () => {
    assert.strictEqual(derivePathFromScope(topScope, 'health'), '/health');
  });

  it('child of root sentinel (no parent) → /{id}', () => {
    assert.strictEqual(derivePathFromScope(root, 'health'), '/health');
  });

  it('nested under one child scope → /{childId}/{id}', () => {
    const child = { id: 'v1', parent: topScope };
    assert.strictEqual(derivePathFromScope(child, 'users'), '/v1/users');
  });

  it('deeply nested → /{a}/{b}/{id}', () => {
    const a = { id: 'api', parent: topScope };
    const b = { id: 'v2', parent: a };
    assert.strictEqual(derivePathFromScope(b, 'items'), '/api/v2/items');
  });

  it('URL-encodes special characters in scope IDs', () => {
    const child = { id: 'my routes', parent: topScope };
    assert.strictEqual(derivePathFromScope(child, 'hello world'), '/my%20routes/hello%20world');
  });

  it('URL-encodes slashes in scope IDs', () => {
    const child = { id: 'a/b', parent: topScope };
    assert.strictEqual(derivePathFromScope(child, 'c/d'), '/a%2Fb/c%2Fd');
  });
});

describe('resolveRoutePath', () => {
  const root = { id: 'stack' };
  const topScope = { id: 'app', parent: root };

  it('explicit path is used when provided', () => {
    const path = resolveRoutePath(topScope, 'health', { method: 'GET', path: '/custom', handler: noop });
    assert.strictEqual(path, '/custom');
  });

  it('derives path when path is omitted', () => {
    const path = resolveRoutePath(topScope, 'health', { method: 'GET', handler: noop });
    assert.strictEqual(path, '/health');
  });

  it('derives nested path when path is omitted', () => {
    const child = { id: 'v1', parent: topScope };
    const path = resolveRoutePath(child, 'users', { method: 'GET', handler: noop });
    assert.strictEqual(path, '/v1/users');
  });
});
