# ADR 005: Hybrid Transport (Effect RPC for HTTP, Raw WebSocket for Sessions)

## Status

Accepted

## Context

Etude has two distinct communication patterns:

1. **CRUD operations**: List pieces, import pieces, fetch practice history - standard request/response
2. **Practice sessions**: Real-time bidirectional note streaming during practice - low-latency WebSocket

The backend uses Effect, which provides `@effect/rpc` for type-safe RPC. The question: should both patterns use Effect RPC?

### Alternatives Considered

**1. Full Effect RPC for Everything (Including WebSocket)**

Use `@effect/rpc` with its WebSocket transport for practice sessions.

Problems:
- Effect RPC WebSocket transport targets Node.js, not Cloudflare Workers
- Durable Objects have native WebSocket support with hibernation (cost savings)
- Effect RPC adds encoding overhead; practice sessions need minimal latency (<10ms)
- Would require custom integration between Effect RPC streams and DO lifecycle
- Hibernation API (DO sleeping between messages) incompatible with RPC's connection model

**2. Raw HTTP + Raw WebSocket (No RPC)**

Use plain fetch handlers and manual WebSocket message parsing everywhere.

Problems:
- No type safety between client and server for HTTP endpoints
- Manual serialization/validation code in every handler
- Easy to drift between client expectations and server responses
- Duplicated error handling patterns

**3. tRPC for HTTP + Raw WebSocket**

Use tRPC for HTTP endpoints, manual WebSocket for sessions.

Problems:
- Already using Effect; adding tRPC means two patterns
- tRPC subscriptions exist but have same DO integration challenges
- Would need to bridge tRPC and Effect error types

## Decision

Use a hybrid approach:

### HTTP Endpoints: Effect RPC

Standard CRUD operations use `@effect/rpc` with HTTP transport:

```typescript
// shared/rpc.ts - Schema definitions
export class ListPieces extends Rpc.make("ListPieces")<{
  success: typeof PieceSummary.Array
  error: typeof InternalError
}>() {}

// server/rpc/piece.ts - Handler
export const PieceRouter = Router.make(
  Rpc.effect(ListPieces, () => pieceService.list())
)

// client - Type-safe call
const pieces = yield* client(new ListPieces())
```

### Practice Sessions: Schema-Validated WebSocket

WebSocket messages validated with Effect Schema, but not full RPC:

```typescript
// shared/ws-protocol.ts
export class WsNoteMessage extends Schema.Class<WsNoteMessage>("WsNoteMessage")({
  type: Schema.Literal("note"),
  pitch: MidiPitch,
  velocity: MidiVelocity,
  timestamp: Schema.Number,
  on: Schema.Boolean,
}) {}

// Encode/decode functions
export const encodeNoteMessage = Schema.encode(WsNoteMessage)
export const decodeServerMessage = Schema.decodeUnknown(WsServerMessage)
```

The Durable Object handles WebSocket directly:

```typescript
// session-do.ts
webSocketMessage(ws, message) {
  const decoded = yield* decodeClientMessage(message)
  // Process note, return result
  ws.send(yield* encodeResultMessage(result))
}
```

## Consequences

### Positive

- **Type safety where it matters**: HTTP endpoints fully typed end-to-end
- **Optimal WebSocket performance**: No RPC overhead on latency-critical path
- **DO integration**: Native WebSocket hibernation works without workarounds
- **Incremental adoption**: Can migrate HTTP endpoints to RPC gradually
- **Schema validation**: WebSocket messages still validated, just not full RPC

### Negative

- **Two patterns**: Developers must understand both RPC and raw WebSocket approaches
- **Manual WebSocket lifecycle**: Must handle connection, reconnection, cleanup explicitly
- **Partial type safety**: WebSocket types checked at runtime, not compile-time across boundary
- **Documentation overhead**: Must document which endpoints use which pattern

### Neutral

- Schema definitions shared between both patterns (same source of truth)
- Could migrate WebSocket to RPC later if Effect adds DO-compatible transport
