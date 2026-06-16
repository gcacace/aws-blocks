# Troubleshooting

## Finding the API URL

The API URL is always in `.blocks-sandbox/config.json`:

```bash
cat .blocks-sandbox/config.json
# Local dev:  {"apiUrl":"http://localhost:3000/aws-blocks/api","environment":"local"}
# Sandbox:    {"apiUrl":"https://<id>.execute-api.<region>.amazonaws.com/prod/aws-blocks/api","environment":"sandbox"}
# Production: {"apiUrl":"https://<id>.execute-api.<region>.amazonaws.com/prod/aws-blocks/api","environment":"production"}
```

In production with Hosting, browser requests go through CloudFront (same-origin at `/aws-blocks/api`), but `config.json` still contains the underlying API Gateway URL.

## RPC Wire Protocol

The typed client (`import { api } from 'aws-blocks'`) handles all RPC automatically. This section is for low-level troubleshooting only.

**Format:** JSON-RPC 2.0 — all namespaces share a single `POST` endpoint.

```bash
# "Is it alive?" check:
curl -X POST $(cat .blocks-sandbox/config.json | jq -r .apiUrl) \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"api.ping","params":[],"id":1}'
# → {"jsonrpc":"2.0","result":{"ok":true,"timestamp":...},"id":1}
```

### Request format

```json
{ "jsonrpc": "2.0", "method": "<exportName>.<methodName>", "params": [...args], "id": 1 }
```

- `<exportName>` — the **export variable name** from `aws-blocks/index.ts` (e.g., `export const api = ...` → `api`; `export const authApi = ...` → `authApi`)
- `<methodName>` — the function name inside the namespace
- `params` — positional array of the function's arguments
- Errors return HTTP 200 with a JSON-RPC `error` object (not a non-2xx HTTP status)

### Examples

```bash
# api.createNote("Hello", "World")
curl -X POST http://localhost:3000/aws-blocks/api \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"api.createNote","params":["Hello","World"],"id":1}'

# authApi.getAuthState()
curl -X POST http://localhost:3000/aws-blocks/api \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"authApi.getAuthState","params":[],"id":1}'

# authApi.setAuthState (sign up)
curl -X POST http://localhost:3000/aws-blocks/api \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"authApi.setAuthState","params":[{"action":"signUp","username":"alice@example.com","password":"Secret123!"}],"id":1}'
```

### Common issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| 404 on `/api/...` or `/authApi/...` | Wrong URL — all calls go to one endpoint | Use `POST /aws-blocks/api` with method in the body |
| HTTP 200 but `{"error":...}` in body | Normal JSON-RPC error response | Read `error.message` — not a routing problem |
| `API 'foo' not found` | Namespace doesn't match any export name | Check your `export const` names in `aws-blocks/index.ts` |
| `config.json` not found | Server not started or not deployed yet | Run `npm run dev` or `npm run sandbox` first |

## Server won't start

```bash
# Check if port is already in use:
lsof -i :3000

# Kill stale processes:
pkill -f "tsx watch"
```

## Auth cookies not persisting

Cookies are `HttpOnly; Secure; SameSite=None; Partitioned`. In local dev, the dev server handles this transparently. If testing with `curl`, you need to save and resend cookies:

```bash
# Sign in and save cookies
curl -c cookies.txt -X POST http://localhost:3000/aws-blocks/api \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"authApi.setAuthState","params":[{"action":"signIn","username":"alice@example.com","password":"Secret123!"}],"id":1}'

# Use cookies for authenticated calls
curl -b cookies.txt -X POST http://localhost:3000/aws-blocks/api \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"api.listNotes","params":[],"id":1}'
```
