# OTel Logger

Structured logging via OpenTelemetry, exported to Amazon CloudWatch Logs through the
OTLP endpoint (in-process OTel SDK + standalone OpenTelemetry Collector Lambda layer).
Part of the OTel building-block family alongside `@aws-blocks/bb-otel-metrics` and
`@aws-blocks/bb-otel-tracer`.

> **Recommended for new applications.** This is the preferred logging block — it's
> vendor-neutral (OTLP to CloudWatch or any backend) and correlates logs with OTel traces.

**When to use:** the default for application logs. Records correlate automatically with OTel
traces and can be exported to CloudWatch or any third-party OTLP backend. Choose the
AWS-native `Logger` block only if you specifically want plain structured JSON to stdout/stderr.

## API

```typescript
const log = new OtelLogger(scope, id, options?)

log.info('Server started', { port: 3000 });
log.error('Request failed', { err: new Error('timeout') });
const reqLog = log.child({ requestId: 'r1' });
```

| Method | Description |
|--------|-------------|
| `debug/info/warn/error(message, context?)` | Emit an OTel `LogRecord` at the given severity. |
| `child(context)` | Child logger with merged default attributes. |
| `rawLogger` | The underlying OTel Logs-Bridge `Logger` — escape hatch. |

### Options

- `level` — minimum level (`debug`/`info`/`warn`/`error`). Default `info`, or `LOG_LEVEL` env.
- `defaultContext` — attributes on every record.

Context values are coerced to OTel-safe attributes: primitives pass through, `Error`s are
extracted to `{name,message,stack}`, BigInt → string, and complex/circular values are
safely JSON-stringified.

## CloudWatch & local dev

Logs flow to a dedicated `/aws/otel/<fullId>` CloudWatch Logs group (created by the CDK
construct; the OTLP logs endpoint requires a pre-existing group + stream). Locally, log
records print to stdout via the OTel `ConsoleLogRecordExporter`.
