# OTel Metrics

Custom application metrics via OpenTelemetry, exported to Amazon CloudWatch's native
OTLP endpoint (PromQL-queryable) through an in-process OTel SDK and a standalone
OpenTelemetry Collector Lambda layer. Part of the OTel building-block family alongside
`@aws-blocks/bb-otel-logger` and `@aws-blocks/bb-otel-tracer`.

> **Recommended for new applications.** This is the preferred metrics block — it's
> vendor-neutral (OTLP to CloudWatch or any backend) and offers typed OTel instruments.

**When to use:** the default for application metrics. You get OTel instrument semantics
(monotonic counters, histograms, async gauges) and can point telemetry at CloudWatch or any
third-party OTLP backend. Choose the AWS-native `Metrics` block only if you specifically need
CloudWatch Embedded Metric Format (EMF) / classic namespace+dimension metrics.

## API

```typescript
const metrics = new OtelMetrics(scope, id, options?)
```

| Method | Returns | Description |
|--------|---------|-------------|
| `emit(name, value, options?)` | `void` | Record an additive data point (mapped onto an OTel Counter). |
| `emitBatch(metrics)` | `void` | Record multiple data points (max 100). |
| `flush()` | `void` | No-op; the SDK is force-flushed by the runtime before the handler returns. |
| `child(attributes)` | `OtelMetricsEmitter` | Child emitter with merged default attributes. |
| `counter/histogram/upDownCounter/observableGauge(name, …)` | instrument | Typed OTel instruments. |
| `rawMeter` | `Meter` | The underlying OTel `Meter` — full escape hatch. |

### Options

| Option | Type | Description |
|--------|------|-------------|
| `namespace` | `string` | Meter/instrumentation-scope name; the metric namespace surfaced to the Dashboard. Defaults to `scope.fullId`. |
| `defaultAttributes` | `Record<string,string>` | Attributes applied to every metric (per-emit wins). Exposed as `defaultDimensions`. |
| `logger` | `ChildLogger` | Optional internal logger (defaults to error level). |

## CloudWatch & the Dashboard

OTLP metrics are **PromQL-queryable**, not classic namespace/dimension metrics — they
do not appear in `cloudwatch:ListMetrics`. The `Dashboard` block renders PromQL `chart`
widgets for `OtelMetrics` instances (selecting by metric name). Requires no extra setup
beyond `cloudwatch:PutMetricData`, which the CDK construct grants automatically.

## Local development

Metrics are exported to stdout via the OTel `ConsoleMetricExporter` (no collector
locally). The real `@opentelemetry/api` Meter call path and `rawMeter` escape hatch
behave identically to production.
