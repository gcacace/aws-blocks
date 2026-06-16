# Integration test support

Fixtures and helpers for the Cognito integration suite
(`src/user-auth-integration.test.ts`). Not part of the public package —
compiled into `dist/` alongside the tests that use them, but never imported
from the runtime entry files.

## Running the integration tests

```bash
BLOCKS_INTEGRATION=1 \
AWS_PROFILE=<your-profile> \
  node --test dist/user-auth-integration.test.js
```

Without `BLOCKS_INTEGRATION=1` every `describe` in the integration file is
skipped, so the file stays in the default `node --test dist/*.test.js`
glob without hitting the network.

## Two-tier delivery strategy

Integration tests need to verify end-to-end code round-trips against real
Cognito, but Cognito delivers SMS via SNS and email via SES — neither
channel is readable from a test harness. Two complementary approaches:

### 1. Custom-sender (default) — `delivery: 'custom-sender'`

Attaches a **capture Lambda** via Cognito's `LambdaConfig.CustomSMSSender`
+ `LambdaConfig.CustomEmailSender` extension point. Cognito encrypts the
OTP with a KMS CMK and hands the ciphertext to the Lambda; the Lambda
decrypts it and writes plaintext to a DynamoDB table. Test calls
`pool.captureCode(username, purpose)` to read the code back and complete
the challenge.

**No SNS/SES setup needed.** The sender Lambda *replaces* Cognito's
default delivery, so the pool is test-only — no real SMS or email ever
goes out. DDB items TTL after 10 minutes so even leaks self-expire.

Wiring cost: ~15s to provision (KMS key, IAM role, Lambda, DDB) and
~15s to tear down on each suite. Worth it — the alternative is flying
blind on SMS/Email code verification.

### 2. Customer-SES regression — `delivery: 'customer-ses-sns'`

Pool uses Cognito's built-in senders backed by customer-provided SES
identity / SNS role. Matches what customers actually deploy with. Gated
behind `BLOCKS_INTEGRATION_CUSTOMER_SES=1` because SES identity +
SNS-sandbox verified phone are account-level setup steps.

Assertion is shape-only (harness can't read real mail). Kept as a
regression guard — the BB must not fight a customer's SES/SNS config.

## Required AWS permissions

The profile needs these on `*` (any user pool — the fixture creates and
deletes its own):

**Base (always required):**
- `cognito-idp:*` on arbitrary pools/clients
- `cognito-idp:AdminCreateUser` / `AdminDeleteUser`
- `cognito-idp:AdminSetUserPassword` / `AdminSetUserMFAPreference`
- `cognito-idp:InitiateAuth` / `RespondToAuthChallenge`
- `cognito-idp:AssociateSoftwareToken` / `VerifySoftwareToken`
- `sts:GetCallerIdentity`

**Custom-sender mode (default):**
- `kms:CreateKey` / `DescribeKey` / `CreateAlias` / `DeleteAlias` / `ScheduleKeyDeletion`
- `iam:CreateRole` / `AttachRolePolicy` / `PutRolePolicy` / `DeleteRole` / `DetachRolePolicy` / `DeleteRolePolicy`
- `lambda:CreateFunction` / `DeleteFunction` / `AddPermission`
- `dynamodb:CreateTable` / `DeleteTable` / `UpdateTimeToLive` / `GetItem` / `PutItem`
- `logs:DeleteLogGroup` (cleanup of the Lambda's log group)

A pre-canned Admin / PowerUser profile against an isolated dev/sandbox
account is fine. Don't run these against production credentials —
`AdministratorAccess` is broad enough that a buggy fixture could leak
state across other workloads.

## Optional env vars

| Variable | Purpose | Required when |
|---|---|---|
| `BLOCKS_INTEGRATION_REGION` | Override region (default `us-east-1`) | Never |
| `BLOCKS_INTEGRATION_CUSTOMER_SES` | Opt into the customer-SES regression suite | Running that suite |
| `BLOCKS_INTEGRATION_SES_FROM` | Verified SES identity ARN | Customer-SES regression only |
| `BLOCKS_INTEGRATION_SNS_ROLE_ARN` | Cognito → SNS IAM role ARN | Customer-SES regression with SMS only |

## Files

| File | Purpose |
|---|---|
| `test-pool-fixture.ts` | `setupTestPool()` / `cleanup()` / `createConfirmedUser` / `setMfaPreference`. One pool per suite; always use `after(() => pool.cleanup())` to avoid leaks. |
| `custom-sender-harness.ts` | `setupCustomSender(pool)` — provisions KMS + IAM + DDB + Lambda, returns `captureCode(username, purpose)` + `teardown`. Called automatically by `setupTestPool` when `delivery: 'custom-sender'`. |
| `zip.ts` | Minimal PKZIP builder (stored entries, hand-rolled CRC-32) so `custom-sender-harness` can package the inlined Lambda source without a dev-dep. |
| `totp.ts` | Minimal RFC-6238 generator (`totpNow`). Used by TOTP suites to compute live codes from the `sharedSecret` `AssociateSoftwareToken` returns. |
