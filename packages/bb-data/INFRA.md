# bb-data Infrastructure Roadmap

## Current State

Local development uses PGlite (WASM Postgres) - no cloud infrastructure needed.

## Production Requirements

To deploy to AWS, the following infrastructure is needed:

### Option A: Data API (Simpler)

**Pros:** No VPC for Lambda, no connection pooling concerns
**Cons:** Higher latency (~50-100ms), no LISTEN/NOTIFY support

Infrastructure:
- Aurora Serverless v2 PostgreSQL with Data API enabled
- Secrets Manager for credentials
- Isolated VPC subnets (no NAT needed)

Runtime:
- `@aws-sdk/client-rds-data` based Kysely dialect
- Env vars: `BLOCKS_DATA_CLUSTER_ARN`, `BLOCKS_DATA_SECRET_ARN`, `BLOCKS_DATA_DATABASE`

### Option B: Direct Connection (Recommended for Realtime)

**Pros:** Lower latency, supports LISTEN/NOTIFY for realtime
**Cons:** More complex infra, VPC costs

Infrastructure:
- Aurora Serverless v2 PostgreSQL
- RDS Proxy (connection pooling for Lambda)
- VPC with NAT gateway or VPC endpoints
- Secrets Manager for credentials
- Lambda configured in VPC

Runtime:
- `pg` driver based Kysely dialect
- Connection string from Secrets Manager

## Implementation Tasks

1. [ ] Create production Kysely dialect (Data API or pg driver)
2. [ ] Add environment detection (local vs Lambda)
3. [ ] Implement `materialize()` in infra.ts
4. [ ] Add `grantAccess()` helper for Lambda permissions
5. [ ] Migration runner for production (currently local-only)
6. [ ] Connection pooling strategy

## Decision: Data API vs Direct

For future realtime support (LISTEN/NOTIFY), **direct connection with RDS Proxy** is recommended. Data API is acceptable for simpler use cases without realtime needs.
