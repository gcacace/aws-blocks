---
"@aws-blocks/otel-common": minor
"@aws-blocks/bb-otel-metrics": minor
"@aws-blocks/bb-otel-logger": minor
"@aws-blocks/bb-otel-tracer": minor
"@aws-blocks/bb-dashboard": minor
"@aws-blocks/core": minor
"@aws-blocks/blocks": minor
---

Add an OpenTelemetry observability block family: `OtelMetrics`, `OtelLogger`, and
`OtelTracer`. These export vendor-neutral OpenTelemetry telemetry to Amazon CloudWatch's
native OTLP endpoints (or any OTLP backend) via an in-process OTel SDK and a standalone
OpenTelemetry Collector Lambda layer, with a per-invocation force-flush. They keep the
ergonomic API of the existing `Metrics`/`Logger`/`Tracer` blocks and additionally expose
OTel's typed instruments, span links/events, context propagation, and the raw
`Meter`/`Tracer`/`Logger` handles.

- New `@aws-blocks/otel-common` support package (in-process SDK bootstrap + flush,
  collector-config renderer, and the idempotent CDK infra helper).
- `@aws-blocks/bb-dashboard` gains PromQL `chart` widgets so OTLP metrics (which are
  PromQL-queryable, not classic namespace/dimension metrics) render correctly; classic
  `Metrics` dashboards are unaffected.
- `@aws-blocks/core` flushes in-process OpenTelemetry telemetry after each invocation
  (no-op unless an OTel block is in use).
