# @aws-blocks/hosting

Low-level CDK L3 constructs for deploying web applications on AWS
(CloudFront, S3, Lambda, WAF, monitoring, DNS).

## Overview

This package provides:

1. **`HostingConstruct`** -- a CDK L3 construct that provisions a full hosting
   stack (CloudFront distribution, S3 origin, Lambda compute, optional WAF,
   monitoring dashboards, and DNS records).

2. **Framework adapters** (Next.js, Nuxt, Astro, SPA) that run the framework
   build, produce a `DeployManifest`, and hand off to the construct for
   provisioning.

3. **Manifest types** (`DeployManifest`, `RouteBehavior`, `ComputeResource`,
   etc.) that describe the shape of a deployment.

## When to use this package directly

Most users should use `Hosting` from `@aws-blocks/core`, which wraps these
constructs with the AWS Blocks integration layer (route registry, config.json
generation, RPC prefix wiring).

Use `HostingConstruct` directly when you need:

- A standalone CDK app without the AWS Blocks layer
- Fine-grained control over construct props
- Custom adapters or manifest generation pipelines

## Main exports

```ts
// Root entry point
import {
  HostingConstruct,
  HostingConstructProps,
  HostingDomainConfig,
  HostingWafConfig,
  generateBuildId,
  DeployManifest,
  RouteBehavior,
  ComputeResource,
  FrameworkAdapterFn,
  HostingError,
} from '@aws-blocks/hosting';

// Sub-path: construct only
import { HostingConstruct } from '@aws-blocks/hosting/constructs';

// Sub-path: adapters only
import { nextjsAdapter, nuxtAdapter, astroAdapter, spaAdapter } from '@aws-blocks/hosting/adapters';

// Sub-path: typed errors
import { HostingError } from '@aws-blocks/hosting/error';
```

## Architecture

```
┌──────────────────────────────────────────────┐
│  Framework Adapter (nextjs / nuxt / astro)   │
│  - runs build                                │
│  - emits DeployManifest                      │
└──────────────────┬───────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────┐
│  HostingConstruct (CDK L3)                   │
│  - CloudFront distribution                   │
│  - S3 origin (static assets)                 │
│  - Lambda compute (SSR / API / middleware)   │
│  - Optional: WAF, DNS, monitoring, warmup    │
└──────────────────────────────────────────────┘
```

## Development

```bash
npm run build        # compile TypeScript
npm test             # run tests (node --test)
```

## License

Apache-2.0
