# Manual-test Cognito pools

Spin up every pool configuration the scenario matrix exercises so you can
drive them by hand from curl / Postman / a Blocks-wired demo app without
touching the integration-test file.

## What gets deployed

Seven user pools (same config as
`packages/bb-auth-cognito/src/scenarios.sandbox.test.ts`), each with:

- Its own **KMS key + Lambda + DynamoDB capture table** (via
  `test-support/custom-sender-harness.ts`) so you can read real SMS / email
  codes Cognito emits during MFA / sign-up / forgot-password flows.
- Seeded users for the flows that pool exercises. All passwords are
  `ManualTest!1`, except admin-created temp-password users which have
  `Temp1234!AB`.

| Key | Config | Scenarios | Seeded users |
| --- | --- | --- | --- |
| A | `mfa:off` + self-signup | self-signup, forgot-password | basic, forgot-password |
| B | `mfa:optional` + TOTP | optional-nothing-enrolled, NEW_PASSWORD_REQUIRED | basic, temp-password |
| C | `mfa:required` + [TOTP] | MFA_SETUP TOTP → enroll | totp-setup |
| D | `mfa:required` + [EMAIL] | EMAIL_OTP challenge | email-mfa |
| E | `mfa:required` + [TOTP, EMAIL] | default flow + setup selection | default-flow, setup-selection |
| F | `mfa:optional` + [SMS, TOTP] | SMS enrolled, MFA_SELECTION | sms-enrolled, totp-and-sms |
| G | USER_AUTH + [PASSWORD, EMAIL_OTP, SMS_OTP] | preferredChallenge dispatch, SELECT_CHALLENGE | password-or-email, sms-otp |

## Prereqs

- Build the package first — the scripts import compiled helpers from
  `dist/test-support/`:
  ```
  npm run build -w @aws-blocks/bb-auth-cognito
  ```
- A **verified SES identity** in the calling account. Domain identities are
  preferred (Cognito's SES validator is pickier about email identities).
- IAM permissions: `cognito-idp:*`, `iam:Create/Delete/PutRole*`,
  `kms:CreateKey/CreateAlias/ScheduleKeyDeletion`, `lambda:*`, `dynamodb:*`,
  `logs:DeleteLogGroup`, `sts:GetCallerIdentity`, `ses:List*`.

## Deploy

From `packages/bb-auth-cognito/`:

```
AWS_PROFILE=<profile> npm run deploy:manual-pools
```

Subset:

```
AWS_PROFILE=<profile> POOLS=A,C,G npm run deploy:manual-pools
```

Takes roughly 90s × number-of-pools (KMS + Lambda + IAM eventual consistency
dominates). Writes a manifest to `scripts/.manual-pools.json` (gitignored)
with every ID + credential you'll need.

## Drive a flow

With the manifest in hand, there are two ways to poke at a pool:

### 1. Point the `auth-cognito` demo at a pool

```
cd <path-to-your-auth-cognito-demo-app>/
export BLOCKS_AUTH_COGNITO_AUTH_USER_POOL_ID=<from-manifest>
export BLOCKS_AUTH_COGNITO_AUTH_CLIENT_ID=<from-manifest>
export BLOCKS_AUTH_COGNITO_AUTH_REGION=<from-manifest>
export BLOCKS_AUTH_COGNITO_AUTH_SESSION_SECRET_PARAM=__manual__
npm run dev
```

### 2. Hit Cognito directly with the SDK / curl

Use the seeded users + `aws cognito-idp initiate-auth`, then read the OTP code
from the capture DDB table:

```
aws dynamodb get-item \
  --table-name <captureTable from manifest> \
  --key '{"pk":{"S":"<username>#mfa"}}'
```

Purpose keys in the capture table:

| Purpose | Emitted by |
| --- | --- |
| `signup` | `SignUp` (pool A only) |
| `forgot` | `ForgotPassword` (pool A) |
| `mfa` | any `EMAIL_OTP` / `SMS_MFA` / `SMS_OTP` challenge |
| `mfa-setup` | EMAIL_OTP MFA_SETUP flow |

## Teardown

```
AWS_PROFILE=<profile> npm run teardown:manual-pools
```

Drops every resource the manifest lists (pool → Lambda → IAM → KMS alias +
scheduled deletion → DDB → dummy SNS role). Each step is best-effort; logs
`✓`/`•` (already gone) / `✗` per resource. Clears the manifest on full
teardown; with `POOLS=…` it rewrites the manifest minus the reaped pools.

KMS keys are scheduled for deletion with a 7-day pending window (AWS
minimum). If you need to re-use the account for more test runs before that,
that's fine — new pools get new keys.
