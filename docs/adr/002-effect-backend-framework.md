# ADR 002: Effect as Backend Framework

## Status

Accepted

## Context

Etude's backend needs to handle:

- HTTP API endpoints for CRUD operations on pieces and practice attempts
- WebSocket message validation
- Database queries with proper error handling
- Service composition and dependency injection

Traditional Node.js backends typically use Express, Fastify, or Hono with manual error handling and ad-hoc dependency injection patterns.

### Alternatives Considered

**1. Express/Fastify with Manual Patterns**

Standard approach: middleware chains, try/catch blocks, manual DI via closures or class constructors.

Problems:
- Error handling is inconsistent (thrown exceptions vs error responses vs unhandled promises)
- No compile-time guarantees about error types
- Dependency injection requires boilerplate or external DI containers
- Testing requires mocking globals or complex setup

**2. Hono (Cloudflare-optimized)**

Lightweight framework designed for edge runtimes.

Problems:
- Same error handling limitations as Express
- No structured approach to service composition
- Would still need separate validation library

**3. tRPC**

Type-safe RPC with excellent TypeScript integration.

Problems:
- Focused on client-server type sharing, less on backend architecture
- No built-in effect system for managing side effects
- Error handling still based on thrown exceptions

## Decision

Use Effect as the primary backend framework.

Effect provides:

- **Typed errors**: Every function declares what errors it can produce
- **Resource management**: Automatic cleanup via `Scope`
- **Dependency injection**: Compile-time checked via `Context` and `Layer`
- **Structured concurrency**: Fiber-based with proper cancellation

Service composition pattern:

```typescript
// Define service interface
class MusicXmlService extends Context.Tag("MusicXmlService")<
  MusicXmlService,
  { parse: (xml: string) => Effect.Effect<NoteEvent[], ParseError> }
>() {}

// Implement as Layer
const MusicXmlServiceLive = Layer.succeed(MusicXmlService, {
  parse: (xml) => Effect.gen(function* () {
    // implementation
  })
})

// Compose layers
const AppLayer = Layer.mergeAll(
  MusicXmlServiceLive,
  SqlLive,
  PieceServiceLive
)
```

RPC handlers use `@effect/rpc` for type-safe client-server communication:

```typescript
export const PieceRouter = Router.make(
  Rpc.effect(ListPieces, () =>
    Effect.gen(function* () {
      const pieceService = yield* PieceService
      return yield* pieceService.list()
    })
  )
)
```

## Consequences

### Positive

- **Compile-time error checking**: Cannot forget to handle an error type
- **Testable by design**: Swap layers for test implementations without mocking
- **Consistent patterns**: All async operations use the same Effect abstraction
- **Type-safe RPC**: Client and server share schema definitions, no runtime surprises
- **Structured resource management**: Database connections, file handles cleaned up automatically

### Negative

- **Steep learning curve**: Effect has its own paradigm (functional effects, fibers, layers)
- **Ecosystem size**: Smaller community than Express; fewer tutorials and Stack Overflow answers
- **Bundle size**: Effect adds ~50KB to server bundle (less relevant for backend)
- **Hiring**: Most developers unfamiliar with Effect; requires onboarding investment
- **Debugging**: Stack traces through Effect generators can be harder to read

### Neutral

- Requires consistent discipline to use Effect patterns throughout (mixing styles causes friction)
- Documentation is improving but still maturing
