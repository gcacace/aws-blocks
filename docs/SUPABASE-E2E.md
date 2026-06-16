# Supabase E2E Testing

End-to-end tests that run against a real Supabase project to validate the `bb-data` CRUD layer and the migration system.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│ CI (GitHub Actions)                                 │
│                                                     │
│  e2e-supabase job                                   │
│  ├── packages/bb-data/dist/crud/crud-e2e.test.js    │  14 tests
│  └── packages/bb-data/dist/crud/migrations-e2e.test │   4 tests
│                                                     │
│  Env vars from GitHub Secrets (publish environment) │
└──────────────────────┬──────────────────────────────┘
                       │ HTTPS + PostgreSQL
                       ▼
┌─────────────────────────────────────────────────────┐
│ Supabase (hosted)                                   │
│  Project: blocks-e2e (aws-blocks-e2e org)              │
│  Region: eu-central-1                               │
│  Auth: ES256 JWT, email confirmation disabled       │
│  DB: todos table with RLS (auth.uid() = user_id)   │
└─────────────────────────────────────────────────────┘
```

## Running locally

Set the environment variables and run:

```bash
export SUPABASE_PROJECT_REF="<project-ref>"
export SUPABASE_ANON_KEY="<anon-key>"
export SUPABASE_DB_URL="<connection-string>"  # password must be URL-encoded (# → %23)
export SUPABASE_TEST_USER_1_EMAIL="blocks-e2e-user1@example.com"
export SUPABASE_TEST_USER_1_PASSWORD="<password>"
export SUPABASE_TEST_USER_2_EMAIL="blocks-e2e-user2@example.com"
export SUPABASE_TEST_USER_2_PASSWORD="<password>"

npm run build && npm run test:e2e:supabase
```

Credentials are stored in AWS Secrets Manager (`blocks/supabase-e2e` in account `540280374183`, us-east-1):

```bash
aws secretsmanager get-secret-value --secret-id blocks/supabase-e2e --region us-east-1 --profile blocks-ci --query SecretString --output text | jq .
```

Tests skip gracefully when env vars are not set — no failures in local dev without credentials.

## Supabase project setup

If the project needs to be recreated:

1. **Create project** in the `aws-blocks-e2e` org on supabase.com
2. **Enable ES256 JWT signing** — Dashboard → Project Settings → Auth → JWT Signing Keys
3. **Disable email confirmation** — Dashboard → Authentication → Settings → Email → Disable "Confirm email"
4. **Apply schema** — run `packages/bb-data/test/fixtures/supabase-e2e-schema.sql` in the SQL Editor
5. **Create test users** — Dashboard → Authentication → Users → Add User:
   - `blocks-e2e-user1@example.com`
   - `blocks-e2e-user2@example.com`
6. **Update secrets** — AWS Secrets Manager + GitHub repo secrets (`publish` environment)

No seed data is required — tests create and clean up their own rows.

## CI configuration

- **Job:** `e2e-supabase` in `.github/workflows/pr-checks.yml`
- **Concurrency:** Serialized (`cancel-in-progress: false`) to prevent test data interference
- **Timeout:** 10 minutes
- **Environment:** `publish` (provides access to secrets)
- **Keep-alive:** `.github/workflows/supabase-keepalive.yml` pings every 3 days to prevent free-tier pausing

## What's tested

| Suite | Tests | Validates |
|-------|-------|-----------|
| CRUD E2E | 14 | `createCrudHandlers` — list, get, create, update, delete with RLS enforcement + filter DSL (where, orderBy, limit, select, like) |
| Migrations E2E | 4 | `runMigrations` — apply, skip already-applied, incremental, rollback on failure |

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Invalid URL` | `#` in DB password not URL-encoded | Use `%23` instead of `#` in `SUPABASE_DB_URL` |
| `email_address_not_authorized` | Email confirmation enabled | Disable in Dashboard → Auth → Settings → Email |
| `Unsupported JWT algorithm: HS256` | Project using symmetric signing | Switch to ES256 or RS256 in Dashboard → Auth → JWT Signing Keys |
| Tests skip (no failures) | Env vars not set | Export the variables or run in CI |
| Project paused | No activity for 7 days | Keepalive workflow should prevent this; manually unpause in Dashboard |
