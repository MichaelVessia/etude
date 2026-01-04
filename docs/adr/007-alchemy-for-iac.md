# ADR 007: Alchemy for Infrastructure as Code

## Status

Accepted

## Context

Etude deploys to Cloudflare with multiple resources:

- Worker (serves API and static assets)
- D1 database (persistent storage)
- Durable Object (session state)
- Custom domain binding

These resources need to be provisioned and configured consistently across environments (dev, production).

### Alternatives Considered

**1. Terraform with Cloudflare Provider**

Industry-standard IaC tool with official Cloudflare provider.

Problems:
- HCL syntax separate from application code (context switching)
- State management requires remote backend setup (S3, Terraform Cloud)
- Cloudflare provider sometimes lags behind new features
- Heavy tooling for a single-platform deployment

**2. Pulumi**

IaC in real programming languages (TypeScript, Python).

Problems:
- Requires Pulumi account/backend for state
- More complex than needed for Cloudflare-only infrastructure
- TypeScript support good but still separate from application code patterns

**3. Wrangler CLI Only**

Use Cloudflare's native CLI tool for deployments.

Problems:
- `wrangler.toml` is declarative but limited
- No programmatic control over resource relationships
- Environment management is manual (separate configs per environment)
- Cannot express dependencies between resources

**4. Manual Dashboard Configuration**

Configure resources through Cloudflare dashboard.

Problems:
- Not reproducible
- No version control
- Easy to drift between environments
- Onboarding requires manual steps

## Decision

Use Alchemy, a TypeScript-native IaC tool designed for Cloudflare:

```typescript
// alchemy.run.ts
import { Alchemy, type Scope } from "alchemy"
import { Assets, D1Database, DurableObjectNamespace, Worker } from "alchemy/cloudflare"

const app = new Alchemy("etude")

await app.run(async (scope: Scope) => {
  const database = await D1Database("etude-db", {})

  const sessionDO = await DurableObjectNamespace("session-do", {
    className: "SessionDO",
  })

  const assets = await Assets("etude-assets", {
    path: "./packages/client/dist",
  })

  await Worker("etude", {
    entrypoint: "./packages/server/src/worker.ts",
    bindings: {
      DB: database,
      SESSION_DO: sessionDO,
      ASSETS: assets,
    },
    url: true, // Get deployed URL
  })
})
```

Run with environment variable for staging:

```bash
ALCHEMY_STAGE=dev bun run alchemy.run.ts   # Dev environment
ALCHEMY_STAGE=prod bun run alchemy.run.ts  # Production
```

State is stored encrypted in Cloudflare KV via `CloudflareStateStore`.

## Consequences

### Positive

- **TypeScript native**: Same language as application; full IDE support
- **Cloudflare-optimized**: First-class support for Workers, D1, DOs, etc.
- **Simple mental model**: Resources are async functions that return handles
- **Built-in state management**: Encrypted state in Cloudflare KV, no external backend
- **Environment handling**: `ALCHEMY_STAGE` cleanly separates dev/prod

### Negative

- **Cloudflare lock-in**: Alchemy is Cloudflare-specific; cannot deploy elsewhere
- **Smaller ecosystem**: Less documentation, fewer examples than Terraform
- **Newer tool**: Less battle-tested; potential for bugs or missing features
- **Single maintainer risk**: Alchemy is not backed by large organization

### Neutral

- Learning curve is low for TypeScript developers
- Can fall back to Terraform if Alchemy becomes unmaintained
- Wrangler.toml still used for some local dev configuration
