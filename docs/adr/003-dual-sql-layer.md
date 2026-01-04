# ADR 003: Dual SQL Layer (SQLite Local + D1 Production)

## Status

Accepted

## Context

Etude stores persistent data (pieces, practice attempts) in a relational database. The production deployment targets Cloudflare Workers, which provides D1 as a managed SQLite-compatible database.

Local development needs a database that:
- Works without network connectivity
- Supports the same SQL dialect as production
- Enables fast iteration without cloud round-trips

### Alternatives Considered

**1. D1 for Everything (Including Local Dev)**

Use Cloudflare's D1 database in both environments.

Problems:
- Local development requires network connectivity
- Slower iteration cycle (remote database calls)
- Wrangler's D1 local emulation exists but adds tooling complexity
- Cannot run tests offline

**2. PostgreSQL Everywhere**

Use PostgreSQL locally and a managed PostgreSQL service (Neon, Supabase) in production.

Problems:
- Cannot deploy to Cloudflare Workers (no PostgreSQL driver for edge runtime)
- Would require different deployment target (traditional Node.js hosting)
- Loses edge locality benefits

**3. Single SQLite File (No Abstraction)**

Use SQLite directly everywhere, access D1 as "just SQLite."

Problems:
- D1 API differs from standard SQLite drivers
- Would need conditional imports and runtime checks scattered throughout codebase

## Decision

Implement a SQL abstraction layer with two implementations:

1. **Local**: `@effect/sql-sqlite-bun` - Direct SQLite via Bun's native bindings
2. **Production**: `@effect/sql-d1` - Cloudflare D1 client

Both implementations satisfy the same `SqlClient` interface from `@effect/sql`:

```typescript
// sql.ts (local)
export const SqlLive = SqliteBun.layer({
  filename: Config.succeed("./local.db"),
})

// sql-d1.ts (production)
export const makeD1SqlLayer = (db: D1Database) =>
  D1.layer({ db: Config.succeed(db) })
```

Schema is defined once using Drizzle ORM for type safety and migrations:

```typescript
// db/schema.ts
export const pieces = sqliteTable("pieces", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  // ...
})
```

Layer selection happens at application entry point based on environment.

## Consequences

### Positive

- **Offline development**: No network required for local work
- **Fast tests**: In-memory or file-based SQLite runs tests quickly
- **Same SQL dialect**: SQLite in both environments; no query translation needed
- **Type-safe queries**: Drizzle provides compile-time SQL validation
- **Environment parity**: Same schema, same queries, different drivers

### Negative

- **Two implementations to maintain**: Bug fixes may need application in both layers
- **Abstraction cost**: Cannot use D1-specific features (like HTTP API) without breaking local
- **Migration complexity**: Must ensure migrations work on both SQLite variants
- **Testing gap**: Some D1 behaviors (like connection limits) cannot be tested locally

### Neutral

- Drizzle ORM adds a dependency but provides migration tooling
- Layer pattern is idiomatic Effect; no additional architectural complexity
