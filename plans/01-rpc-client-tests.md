# Task: Add RPC Client Tests

## Problem

`SessionRpcClient` and `PieceRpcClient` in `packages/client/src/rpc/` have zero test coverage. These are critical for type-safe communication between client and server.

## Current State

```
packages/client/src/rpc/
├── session.ts    # SessionRpcClient - untested
├── piece.ts      # PieceRpcClient - untested
└── index.ts      # Re-exports
```

The clients use `@effect/rpc` with proper protocol layers but no tests verify:
- Schema encoding/decoding
- Error handling paths
- Network failure scenarios
- Response parsing

## Proposed Solution

Add comprehensive tests using `@effect/vitest` (or `bun-test-effect` for consistency with server tests).

## Implementation Steps

### 1. Set up test infrastructure

Create `packages/client/src/rpc/__tests__/` with test utilities:
- Mock HTTP layer that intercepts RPC calls
- Test fixtures for valid/invalid responses
- Helper to create test client with mocked transport

### 2. Test SessionRpcClient

```typescript
// packages/client/src/rpc/__tests__/session.test.ts

describe("SessionRpcClient", () => {
  it.effect("startSession encodes request and decodes response", () =>
    Effect.gen(function* () {
      const client = yield* SessionRpcClient
      const result = yield* client.startSession({
        pieceId: "test-piece",
        measureStart: 1,
        measureEnd: 4,
        hand: "both",
        tempo: 120,
      })
      // Assert SessionStarted shape
    })
  )

  it.effect("handles SessionError from server", () =>
    Effect.gen(function* () {
      // Mock server returning SessionError
      const client = yield* SessionRpcClient
      const result = yield* client.startSession({...}).pipe(
        Effect.either
      )
      expect(result._tag).toBe("Left")
    })
  )

  it.effect("handles network failures", () =>
    Effect.gen(function* () {
      // Mock transport layer failure
    })
  )
})
```

### 3. Test PieceRpcClient

```typescript
// packages/client/src/rpc/__tests__/piece.test.ts

describe("PieceRpcClient", () => {
  it.effect("listPieces returns array of PieceSummary", () => ...)
  it.effect("getPiece returns full Piece with notes", () => ...)
  it.effect("handles PieceNotFound error", () => ...)
  it.effect("importPiece validates MusicXML", () => ...)
})
```

### 4. Test error scenarios

- Invalid response schema (server bug)
- Network timeout
- HTTP error codes
- Malformed JSON

## Files to Create/Modify

| File | Action |
|------|--------|
| `packages/client/src/rpc/__tests__/session.test.ts` | Create |
| `packages/client/src/rpc/__tests__/piece.test.ts` | Create |
| `packages/client/src/rpc/__tests__/test-utils.ts` | Create (mock transport) |

## Testing Approach

Use `@effect/vitest` or `bun-test-effect`:

```typescript
import { it, describe } from "@effect/vitest"
// or
import { it } from "@codeforbreakfast/bun-test-effect"
```

Mock the HTTP fetch layer to control responses without network calls.

## Success Criteria

- [x] SessionRpcClient: startSession, endSession, submitNote tested
- [x] PieceRpcClient: listPieces, getPiece, getAttempts, getPieceNotes, importPiece tested
- [x] Error paths covered (SessionError, PieceNotFound, ParseError, network failures)
- [x] Schema validation failures handled
- [x] Tests run in CI

## Estimated Scope

- ~200-300 lines of test code
- 1-2 hours implementation
