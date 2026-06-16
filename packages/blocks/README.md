# @aws-blocks/blocks

AWS Blocks — a unified package that re-exports all Building Blocks and core functionality.

## For Coding Agents

### How to work with a Blocks app

1. **Backend logic** lives in `aws-blocks/index.ts`. This is your starting point for APIs, data, and auth.
2. **Frontend** lives in `src/`. It imports backend APIs directly via `import { api } from 'aws-blocks'` (fully typed).
3. **Test via direct imports** — run `npm run test:e2e` which tests your API through the same typed imports, no browser needed. Write tests first, iterate until they pass.
4. **Local dev** — `npm run dev` starts a local server with mock storage (no AWS needed). All Building Blocks work locally.
5. **Deploy** — `npm run sandbox` deploys to AWS and serves the frontend.

### Testing workflow (recommended)

The fastest feedback loop is testing the API via direct imports in `test/e2e.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert';
import type { api as ApiType } from 'aws-blocks';

let api: typeof ApiType;
test.before(async () => {
  // Starts dev server, imports the typed client
  const mod = await import('aws-blocks');
  api = mod.api;
});

test('creates and retrieves data', async () => {
  const result = await api.createItem('test');
  assert.ok(result.id);
});
```

Run with: `npm run test:e2e`

> **⚠️ Always read `@aws-blocks/*` documentation from `node_modules`, not from the web.**
> The docs installed in `node_modules` match the exact version in your project.

### Architecture

An AWS Blocks app has one directory (`aws-blocks/`) that defines the entire backend:

```typescript
// aws-blocks/index.ts
import { Scope, ApiNamespace, KVStore } from '@aws-blocks/blocks';

const scope = new Scope('my-app');
const store = new KVStore(scope, 'cache');

export const api = ApiNamespace('api', (context) => ({
  async getData(key: string) {
    return await store.get(key);
  },
}));
```

Frontend imports are fully typed — no client generation:

```typescript
import { api } from 'aws-blocks';
const data = await api.getData('hello'); // typed return value
```

### Building Block Catalog

Each Building Block is published as a separate npm package with a `README.md` containing full API reference, examples, best practices, and scaling characteristics.

| Building Block | Package | When to use |
|---|---|---|
| `Scope` | `@aws-blocks/core` | Define resource boundaries for your backend |
| `ApiNamespace` | `@aws-blocks/core` | Type-safe APIs with automatic frontend/backend integration |
| `AuthBasic` | `@aws-blocks/bb-auth-basic` | Username/password auth for prototypes, internal tools, MVPs |
| `AuthCognito` | `@aws-blocks/bb-auth-cognito` | Cognito User Pool auth: username/password + MFA + groups |
| `KVStore` | `@aws-blocks/bb-kv-store` | Simple key-value get/put/delete (user prefs, flags, caches) |
| `DistributedTable` | `@aws-blocks/bb-distributed-table` | Structured data with indexes and queries — **default for most data** |
| `DistributedDatabase` | `@aws-blocks/bb-distributed-data` | Serverless SQL (Aurora DSQL) — zero-ops, scales to zero, no FK/RLS |
| `Database` | `@aws-blocks/bb-data` | Full PostgreSQL (Aurora) — FK, RLS, triggers, views, or existing DBs |
| `Realtime` | `@aws-blocks/bb-realtime` | Push data to browsers (chat, notifications, live dashboards) |
| `AsyncJob` | `@aws-blocks/bb-async-job` | Fire-and-forget background work (emails, uploads, reports) |
| `FileBucket` | `@aws-blocks/bb-file-bucket` | File storage — uploads, downloads, presigned URLs, static assets |
| `AppSetting` | `@aws-blocks/bb-app-setting` | Single config value or secret (feature flags, API keys, thresholds) |
| `KnowledgeBase` | `@aws-blocks/bb-knowledge-base` | Semantic document retrieval — FAQs, guides, wikis (Bedrock KB + S3 Vectors) |
| `Agent` | `@aws-blocks/bb-agent` | AI agent with tool use, streaming, conversation persistence, and human-in-the-loop approval (Bedrock + OpenAI-API) |
| `Tracer` | `@aws-blocks/bb-tracer` | Distributed tracing — debug latency, visualize service dependencies (X-Ray) |
| `Metrics` | `@aws-blocks/bb-metrics` | Custom application metrics — request counts, latency, error rates (CloudWatch via EMF) |
| `Logger` | `@aws-blocks/bb-logger` | Structured JSON logging — log levels, child loggers, contextual metadata |
| `Dashboard` | `@aws-blocks/bb-dashboard` | Auto-generated CloudWatch Dashboard for operational visibility |
| `Hosting` | `@aws-blocks/core` (`/cdk`) | Deploy a frontend (SPA, static, or Next.js SSR) on CloudFront + S3 with a single-origin API proxy |
| Auth UI | `@aws-blocks/auth-common` | Shared auth interfaces and framework-agnostic UI components |

### Choosing a Data Block

Default to `DistributedTable` for your data models unless your domain specifically requires SQL engine capabilities.

Reach for one of the SQL blocks when you need to filter or join results across more than one related record, filter models on many dimensions with no preset hierarchy, store large objects, require transactions, or otherwise need the flexibility or familiarity of SQL that NoSQL does not offer.

If you need SQL, prefer `DistributedDatabase` for basic Postgres-compatible querying. Use `Database` specifically when you need a full (more expensive) Postgres implementation where the engine itself provides and enforces foreign keys, row level security, triggers, views, large transactions (more than 3,000 rows), or integration with an existing Postgres database. Note it carries an idle cost at minimum 0.5 ACU, or a cold start when scaling from zero, unlike the other two blocks.

### Finding a Building Block's README

To read full documentation for a Building Block, locate its package in `node_modules` and read `README.md`. npm may install packages in different locations depending on hoisting. Try in order:

**1. Hoisted (most common — check this first):**
```
node_modules/@aws-blocks/<package-name>/README.md
```
Example: `node_modules/@aws-blocks/bb-kv-store/README.md`

**2. Nested under this package (if hoisted path doesn't exist):**
```
node_modules/@aws-blocks/blocks/node_modules/@aws-blocks/<package-name>/README.md
```

> **Important for agents using glob/search tools:** Most tools exclude `node_modules` by default.
> Use direct file reads with the paths above — do not rely on glob patterns or `find` commands.

You can also hover over any Building Block class in the IDE — the JSDoc on each re-export includes a summary and the package name.

## RPC Wire Protocol (for debugging and non-JS clients)

The typed `import { api } from 'aws-blocks'` client is the normal calling path. Under the hood it uses **JSON-RPC 2.0** over a single HTTP endpoint. Knowing the wire format is useful for `curl` testing, Postman, or non-JS clients.

**Endpoint:** `POST /aws-blocks/api`

| Environment | URL |
|---|---|
| Local dev (`npm run dev`) | `http://localhost:3000/aws-blocks/api` |
| Sandbox (`npm run sandbox`) | `http://localhost:3000/aws-blocks/api` (proxied to deployed Lambda) |
| Deployed (API Gateway) | `https://<api-id>.execute-api.<region>.amazonaws.com/prod/aws-blocks/api` |

**Request body:**
```json
{ "jsonrpc": "2.0", "method": "<namespace>.<methodName>", "params": [...args], "id": 1 }
```

- `<namespace>` = the first argument to `ApiNamespace(...)` (e.g. `"api"`, `"authApi"`)
- `<methodName>` = the function name inside the namespace
- `params` = positional array of the function's arguments

**Example:**
```bash
# Call api.greet("World")
curl -X POST http://localhost:3000/aws-blocks/api \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"api.greet","params":["World"],"id":1}'
# → {"jsonrpc":"2.0","result":{"message":"Hello, World!"},"id":1}

# Call authApi.getAuthState()
curl -X POST http://localhost:3000/aws-blocks/api \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"authApi.getAuthState","params":[],"id":1}'

# Call authApi.setAuthState({ action: "signUp", username: "alice@example.com", password: "secret123" })
curl -X POST http://localhost:3000/aws-blocks/api \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"authApi.setAuthState","params":[{"action":"signUp","username":"alice@example.com","password":"secret123"}],"id":1}'
```

> **Important:** All namespaces share ONE endpoint (`/aws-blocks/api`). The namespace is in the `method` field, not in the URL path. Errors return HTTP 200 with a JSON-RPC `error` object — not a non-2xx status code.

## Quick Start

### Backend (aws-blocks/index.ts)

```typescript
import { Scope, ApiNamespace, AuthBasic, KVStore } from '@aws-blocks/blocks';

const scope = new Scope('my-app');
const auth = new AuthBasic(scope, 'auth', {
  passwordPolicy: { minLength: 8 },
});
const store = new KVStore(scope, 'store');

export const authApi = auth.createApi();

export const api = new ApiNamespace(scope, 'api', (context) => ({
  async getData(key: string) {
    await auth.requireAuth(context);
    return await store.get(key);
  }
}));
```

> **Every `ApiNamespace` method is a public internet endpoint with no auth by default.** Gate a method by calling `auth.requireAuth(context)` (or `requireRole`) at the top of it. The local mock applies no auth either, so an ungated method passes every local check and still ships callable by anyone.

### Frontend (src/index.ts)

```typescript
import { Authenticator, AuthenticatedContent, onAuthChange } from '@aws-blocks/blocks/ui';
import { authApi } from 'aws-blocks';

// Mount the Authenticator (works with any auth provider)
document.getElementById('auth')!.appendChild(Authenticator(authApi));

// Show content only when signed in
document.getElementById('main')!.appendChild(
  AuthenticatedContent(authApi, (user) => {
    const el = document.createElement('div');
    el.textContent = `Welcome, ${user.username}`;
    return el;
  })
);

// React to auth changes (same window + cross-tab)
onAuthChange(authApi, (user) => {
  console.log(user ? `Signed in: ${user.username}` : 'Signed out');
});
```

## UI Components (from `@aws-blocks/blocks/ui`)

| Export | Description |
|---|---|
| `AccountMenuBar(api)` | Compact bar for page header: "👤 username \| Sign Out" or "Sign In" with modal |
| `Authenticator(api)` | Provider-agnostic auth UI driven by the state machine |
| `AuthenticatedContent(api, render)` | Shows content only when signed in, auto-updates on auth changes |
| `onAuthChange(api, callback)` | Subscribe to auth state changes (same window + cross-tab) |
| `broadcastAuthChange(user)` | Broadcast auth changes (for custom auth UI) |

See `@aws-blocks/auth-common` README for full UI documentation.

## SSR Helpers (from `@aws-blocks/blocks/server`)

`withAuth` forwards the browser's cookies to AWS Blocks API calls made during SSR (server components / loaders). See the `@aws-blocks/core` README for details.

## Development Modes

### `npm run dev` (Local development)
- Single-origin server on port 3000 (frontend proxy on internal port 3100)
- All Building Blocks use local mocks (no AWS credentials needed)
- Mock data persists to `.bb-data/` across restarts — delete to reset
- Auth cookies work correctly (SameSite=Lax, same origin)
- Use for: rapid iteration, local testing

### `npm run sandbox` (AWS-deployed)
- Deploys backend to AWS (Lambda + API Gateway)
- Frontend served locally, proxied to deployed backend
- Use for: testing against real AWS services, pre-production validation
- The frontend discovers the backend URL from `/.blocks-sandbox/config.json` (auto-generated by sandbox)

## Best Practices

1. **Use the right Building Block** — Start with `DistributedTable` for structured data. Only use `Database` when you need SQL features like JOINs. For serverless SQL with zero cold starts, consider `DistributedDatabase`.

2. **Always export your APIs** — The frontend can only import what you export from `aws-blocks/index.ts`.

3. **Use schemas for type safety** — Zod/Valibot schemas provide both compile-time and runtime validation.

4. **Read READMEs from node_modules** — They match your exact installed version. Use direct file reads with paths like `node_modules/@aws-blocks/bb-kv-store/README.md`.

5. **Use AsyncJob for long-running work** — Don't block API responses. Use `AsyncJob` for anything that takes more than a few seconds.

6. **Test locally first** — All Building Blocks work locally without AWS. Iterate fast with mocks before deploying.

7. **Use conditional writes** — Prevent race conditions with `ifNotExists`, `ifValueEquals`, and `ifFieldEquals` conditions.

8. **Organize with Scope** — Use nested scopes to organize related resources logically.

9. **Use `sandbox` for testing against real AWS services** — `npm run dev` uses local mocks. `npm run sandbox` deploys to real AWS for pre-production validation.

## Common Mistakes

### Using Database when DistributedTable suffices
`Database` (Aurora Serverless v2) has cold starts and costs more. Use `DistributedTable` (DynamoDB) unless you specifically need JOINs or transactions. For serverless SQL with zero cold starts, consider `DistributedDatabase` (Aurora DSQL).

### Forgetting to export the API
The frontend can only import exported symbols from `aws-blocks/index.ts`. If your `ApiNamespace` isn't exported, the frontend can't call it.

### Blocking the API with long work
Use `AsyncJob` for anything that takes more than a few seconds. `submit()` returns immediately with a `jobId`.

### Not using schema validation
Without a schema, values are untyped (`unknown`). Add a Zod/Valibot schema to get compile-time AND runtime type safety.

### Not reading Building Block READMEs from node_modules
The READMEs installed in `node_modules/@aws-blocks/*/README.md` match your exact installed version. Web documentation may describe a different version with different APIs.

> **For agents using glob/search tools:** Most tools exclude `node_modules` by default. Use direct file reads with the paths above — do not rely on glob patterns or `find` commands.

### Curling or fetching individual REST-style endpoints
AWS Blocks uses JSON-RPC, not REST. All API calls go to a single POST endpoint (`/aws-blocks/api`). Don't try to `curl GET /api/getData` — it won't work. The frontend SDK handles the protocol automatically via the typed imports (`import { api } from 'aws-blocks'`). If you need to debug API calls, check the browser's Network tab for POST requests to `/aws-blocks/api`.

### Not fixing the scaffolded package.json name
After scaffolding, the `package.json` has a placeholder name (e.g., `"my-app"`). Rename it to a valid kebab-case name (e.g., `"blocks-app"`) before deploying — CDK derives stack names from the package name.

## Debugging

The client uses JSON-RPC 2.0 over HTTP under the hood. You should never need to interact with it directly — write tests using the typed client imports instead (see `test/e2e.test.ts` in your project).

If you need to troubleshoot connectivity or auth issues at the wire level, see [TROUBLESHOOTING.md](./TROUBLESHOOTING.md).
