# @aws-blocks/otel-common

Shared internals for the OpenTelemetry building blocks (`@aws-blocks/bb-otel-metrics`,
`bb-otel-logger`, `bb-otel-tracer`). Not a Building Block itself — a support library,
like `@aws-blocks/auth-common` and `@aws-blocks/data-common`.

## What it provides

- **`getOrCreateOtelSdk(options, exporters?)`** / **`flushOtel()`** (runtime, `.`) — an
  in-process OpenTelemetry SDK singleton. Registers global Tracer/Meter/Logger providers
  whose exporters target the standalone OpenTelemetry Collector Lambda layer on
  `localhost:4318`. `flushOtel()` force-flushes all signals and **must be called before
  the Lambda handler returns** — otherwise the sandbox freeze drops the async exports.
- **`renderCollectorConfig(input)`** (runtime, `.`) — pure renderer for the collector
  YAML: per-service `sigv4auth` extensions, per-signal `otlphttp` exporters to the
  CloudWatch OTLP endpoints, and the **`decouple`** processor (the layer's collector
  build omits `batch`; `decouple` keeps the export alive past the freeze).
- **`getOrCreateOtelSharedInfra(stack, handler, scope, options)`** (CDK, `./cdk`) —
  idempotently attaches the collector layer + a config layer + the
  `OPENTELEMETRY_COLLECTOR_CONFIG_URI` env var to the shared Blocks handler, and grants
  per-signal IAM (`cloudwatch:PutMetricData`; `xray:PutSpans`/`PutSpansForIndexing`/…;
  `logs:PutLogEvents`/`Describe*` + a dedicated log group/stream).

## Export model (validated)

The blocks initialize the SDK in-process and export OTLP/HTTP to a standalone
`opentelemetry-collector` Lambda layer (`open-telemetry/opentelemetry-lambda`, account
`184161586896`). The collector signs with SigV4 and forwards to CloudWatch's native OTLP
endpoints (traces→X-Ray, metrics→CloudWatch, logs→CloudWatch Logs). Set an
`endpointOverride` to redirect to a third-party OTLP backend instead.

**Prerequisite for traces:** CloudWatch **Transaction Search** must be enabled in the
account/region (spans land in the `aws/spans` log group).

## Local development

In the mock runtime the same SDK is used with console/file exporters (no collector
locally), so the real OTel call path and escape-hatch handles are exercised identically
to production.
