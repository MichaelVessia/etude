# Effect RPC Refactor Specification

## Overview

Refactor client-server communication from plain fetch/WebSocket to @effect/rpc for end-to-end type safety, schema validation, and structured error handling.

## Current State

### HTTP Endpoints (fetch)
- `POST /api/piece/import` - Import MusicXML piece
- `POST /api/session/ws/start` - Start practice session, returns WebSocket URL
- `POST /api/session/ws/:id/end` - End session, returns score

### WebSocket Protocol
- **Client → Server**: `note` (pitch, velocity, timestamp, on), `pong`
- **Server → Client**: `ready`, `result`, `error`, `ping`, `sessionEnd`

## Architecture Decisions

### Scope & Phasing
- **Phase 1**: HTTP endpoints only (import first as test case)
- **Phase 2**: Session start/end endpoints
- **Phase 3**: WebSocket → full RPC streams for note communication

### Server
- **Migrate to Effect HttpServer** - full Effect stack, not Hono middleware
- Replace in-place (no parallel endpoints for rollback)

### Client
- **Effect runtime at app root** - single runtime, hooks call into it
- **Effect Atom for state** - replaces React useState/refs for session state
- **Atoms colocated per-feature** - session atoms near session code

### Bundle Size
- No constraint - user experience improvements outweigh bundle cost

### Latency
- **<10ms critical** for note-to-feedback
- If RPC streams can't achieve this, decision deferred to implementation time

## Error Handling

### UX
- **Inline error with retry** - stay on page, show error, let user retry
- **Friendly messages only** - generic "server returned unexpected data", technical details to console

### Client Behavior
- **Per-component error handling** - each component catches its own RPC errors
- **Auto-retry 3x with exponential backoff** for transient network errors
- **Force refresh on version mismatch** - detect schema mismatch, prompt user to reload

## Timeouts & Logging

- **10s default timeout** for all RPC calls
- **Full logging** in all environments (with redaction for sensitive data)

## Testing Strategy

- **Unit tests**: Mock at RpcClient level - test Effect logic
- **Integration tests**: Real server - full confidence
- Both required for RPC layer changes

## Phase 1: Import Endpoint

### RPC Definition
```typescript
// packages/shared/src/rpc/piece.ts
import { Rpc, RpcGroup } from "@effect/rpc"
import { Schema } from "effect"

export class ImportPieceRequest extends Schema.Class<ImportPieceRequest>("ImportPieceRequest")({
  xml: Schema.String,
  title: Schema.optional(Schema.String),
}) {}

export class ImportPieceResponse extends Schema.Class<ImportPieceResponse>("ImportPieceResponse")({
  pieceId: Schema.String,
  title: Schema.String,
  measures: Schema.Number,
  // ... other fields from current ImportPieceResult
}) {}

export class ImportError extends Schema.TaggedError<ImportError>("ImportError")("ImportError", {
  message: Schema.String,
  code: Schema.Literal("PARSE_ERROR", "INVALID_XML", "UNKNOWN"),
}) {}

export const PieceRpc = RpcGroup.make(
  Rpc.effect("importPiece", {
    payload: ImportPieceRequest,
    success: ImportPieceResponse,
    error: ImportError,
  })
)
```

### Server Implementation
```typescript
// packages/server/src/rpc/piece.handler.ts
import { PieceRpc } from "@etude/shared/rpc/piece"
import { Effect } from "effect"

export const PieceRpcLive = PieceRpc.toLayer({
  importPiece: ({ xml, title }) =>
    Effect.gen(function* () {
      // existing import logic, wrapped in Effect
    })
})
```

### Client Usage
```typescript
// packages/client/src/hooks/usePieceImport.ts
import { PieceRpc } from "@etude/shared/rpc/piece"
import { useRpc } from "../effect/useRpc"

export function usePieceImport() {
  const client = useRpc(PieceRpc)

  const importPiece = useCallback((xml: string, title?: string) =>
    client.importPiece({ xml, title })
  , [client])

  return { importPiece }
}
```

## Phase 2: Session Endpoints

Similar pattern to Phase 1:
- `sessionStart` - returns sessionId + initial state
- `sessionEnd` - returns final score

Session state managed via Effect Atom, synced to React for rendering.

## Phase 3: WebSocket Note Streaming

### RPC Stream Definition
```typescript
export const SessionRpc = RpcGroup.make(
  Rpc.stream("noteStream", {
    payload: SessionStreamRequest,  // sessionId
    success: NoteResult,            // streamed results
    error: SessionError,
  })
)
```

### Bidirectional Communication
- Client sends notes via stream input
- Server responds with results via stream output
- Ping/pong handled by RPC protocol layer

### Latency Target
- Must achieve <10ms round-trip for note feedback
- Benchmark during implementation
- If unachievable, revisit architecture (may accept hybrid approach)

## Migration Checklist

### Phase 1
- [ ] Add @effect/rpc, @effect/platform dependencies
- [ ] Create shared RPC definitions in packages/shared
- [ ] Set up Effect HttpServer in packages/server
- [ ] Implement PieceRpc handler
- [ ] Create client Effect runtime provider
- [ ] Add Effect Atom for piece state
- [ ] Implement usePieceImport hook
- [ ] Update Library.tsx to use new hook
- [ ] Remove old /api/piece/import endpoint
- [ ] Unit tests for RPC client mock
- [ ] Integration tests against real server

### Phase 2
- [ ] SessionRpc definitions (start, end)
- [ ] Session handlers
- [ ] Session atoms (isActive, sessionState, results)
- [ ] useSession hook refactor
- [ ] Remove old session endpoints
- [ ] Tests

### Phase 3
- [ ] Note stream RPC definition
- [ ] WebSocket protocol implementation
- [ ] Latency benchmarking
- [ ] useNoteStream refactor
- [ ] Remove old WebSocket code
- [ ] Tests

## Architectural Decision: Phase 3 WebSocket

### Decision: Schema-validated WebSocket wrapper (not full RPC)

**Date:** 2026-01-03

**Context:**
Phase 3 originally planned to migrate WebSocket note streaming to Effect RPC streams.
Investigation revealed challenges:

1. **Cloudflare DO WebSocket is optimized** - Durable Objects handle WebSocket connections
   with in-memory state, hibernation support, and edge locality
2. **Effect RPC WebSocket targets standard environments** - `RpcServer.toHttpAppWebsocket`
   designed for Node.js, not CF Workers
3. **Latency critical** - <10ms round-trip required for note feedback
4. **Integration complexity** - Would need either:
   - Worker-level RPC WS that proxies to DO (extra hop)
   - Custom RPC protocol implementation inside DO

**Decision:**
Keep DO WebSocket transport, add Effect Schema validation on both ends:
- Client: `Schema.decodeUnknown` for incoming, `Schema.encode` for outgoing
- Server: Same validation in DO message handlers

**Benefits:**
- Type safety at compile time and runtime
- Schema validation for data integrity
- No transport layer changes (preserves latency)
- Incremental - can migrate to full RPC later if Effect adds CF support

**Trade-offs:**
- Not "pure" RPC - manual WebSocket management remains
- Schema definitions duplicated (WS types vs RPC types)

**Future reconsideration triggers:**
- Effect RPC adds Cloudflare Workers WebSocket support
- Latency measurements show HTTP RPC is acceptable (<10ms)
- New real-time requirements that benefit from RPC streams

## Open Questions

None - all decisions captured above. Implementation may surface new questions.
