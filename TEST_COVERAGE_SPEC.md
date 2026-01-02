# Test Coverage Spec: 100% Coverage for Etude

## Current State

| Package | Test Files | Tests | Source Files | Coverage |
|---------|------------|-------|--------------|----------|
| shared | 2 | ~20 | 4 | Good |
| server | 6 | ~50 | 14 | Partial |
| client | 1 | ~6 | 27 | Minimal |

**76 passing tests**, primarily backend services/repos. Client coverage is minimal.

---

## Testing Stack

- **Test runner**: Bun Test (native)
- **Effect integration**: `@codeforbreakfast/bun-test-effect` - provides `it.effect()`
- **React testing**: `@testing-library/react` with Happy DOM
- **DI pattern**: Effect Layer composition with `makeTestLayer()`

### Quick Reference: Which Import to Use

| Code Type | Import | Test Pattern |
|-----------|--------|--------------|
| Server services/repos | `@codeforbreakfast/bun-test-effect` | `it.effect()` + `Effect.provide(Layer)` |
| Server HTTP routes | `@codeforbreakfast/bun-test-effect` | `it.effect()` + router testing |
| Shared schemas | `@codeforbreakfast/bun-test-effect` | `it.effect()` for Effect Schema |
| Client React hooks | `bun:test` | `renderHook()` + `act()` |
| Client React components | `bun:test` | `render()` + `screen` queries |

---

## Package: shared

### Tested
- `domain.ts` - Branded types, schemas
- `errors.ts` - Error serialization

### Needs Tests
- `rpc.ts` - RPC definitions (may be covered by integration tests)

### Strategy
RPC definitions are type-level; runtime behavior is tested via server API tests.

---

## Package: server

### Tested
- `repos/piece-repo.ts`
- `repos/attempt-repo.ts`
- `services/comparison.ts`
- `services/musicxml.ts`
- `services/session.ts`

### Needs Tests

#### High Priority

**`api/routes/piece.ts`**
- `GET /pieces` - list all pieces
- `POST /pieces` - create piece from MusicXML
- `GET /pieces/:id` - get single piece
- `GET /pieces/:id/notes` - get note events
- `DELETE /pieces/:id` - delete piece

**`api/routes/session.ts`**
- `POST /sessions/start` - start practice session
- `POST /sessions/note` - submit played note
- `POST /sessions/end` - end session, get results

**`api/server.ts`**
- Server initialization
- CORS headers
- Error handling middleware

#### Medium Priority

**`db/schema.ts`**
- Schema correctness (covered implicitly by repo tests)

**`sql.ts`**
- SQL helpers (covered implicitly)

### Strategy

Use Effect DI with `@codeforbreakfast/bun-test-effect`:

1. **Import from bun-test-effect**: `import { describe, expect, it } from "@codeforbreakfast/bun-test-effect"`
2. **Use `it.effect()`**: For tests that return `Effect`
3. **Layer composition**: Build test layers with `makeTestLayer()` helper
4. **Provide at end**: `.pipe(Effect.provide(TestLayer))`

```typescript
import { describe, expect, it } from "@codeforbreakfast/bun-test-effect"
import { Effect, Layer } from "effect"
import { makeTestLayer, setupTables, clearTables } from "./helpers/test-db.js"

// Compose dependencies
const DepsLayer = Layer.mergeAll(PieceRepoLive, AttemptRepoLive)
const TestLayer = makeTestLayer(DepsLayer)

describe("piece routes", () => {
  it.effect("POST /pieces creates piece", () =>
    Effect.gen(function* () {
      yield* setupTables
      yield* clearTables

      // Access services via yield*
      const pieceRepo = yield* PieceRepo

      // Test logic here
      const piece = yield* pieceRepo.create({ ... })
      expect(piece.id).toBeDefined()
    }).pipe(Effect.provide(TestLayer))
  )
})
```

**Route testing**: Create `TestHttpApp` layer that exposes the Effect HttpApp without starting a server. Test routes directly via Effect's HTTP client or by calling handler functions.

---

## Package: client

### Tested
- `hooks/useNoteColoring.ts`

### Needs Tests

#### High Priority (Hooks)

**`hooks/useMidi.ts`**
- MIDI device connection
- Note on/off events
- Device disconnection handling

**`hooks/useAudio.ts`**
- Tone.js initialization
- Note playback
- Cleanup on unmount

**`hooks/useSession.ts`**
- Session state machine (idle → countdown → active → results)
- Note submission
- Session end

**`hooks/usePiece.ts`**
- Piece data fetching
- Loading/error states

**`hooks/usePlayhead.ts`**
- Playhead position calculation
- Animation timing

**`hooks/usePlayedNotes.ts`**
- Note tracking
- Note clearing

**`hooks/useVerovio.ts`**
- Verovio WASM loading
- SVG rendering

#### Medium Priority (Components)

**`components/SheetMusicView.tsx`**
- Renders SVG from Verovio
- Note coloring integration

**`components/PracticeControls.tsx`**
- Start/stop button behavior
- Settings changes

**`components/CountdownOverlay.tsx`**
- Countdown display
- Callback on complete

**`components/ResultsOverlay.tsx`**
- Score display
- Accuracy breakdown

**`components/PlayedNoteIndicators.tsx`**
- Visual note indicators
- Fading animation

**`components/Playhead.tsx`**
- Position rendering

**`components/MidiStatusBadge.tsx`**
- Connection status display

#### Lower Priority (Pages)

**`pages/Practice.tsx`**
- Integration of all hooks
- Full user flow

**`pages/Library.tsx`**
- Piece list display
- Upload functionality

### Strategy

#### Hook Testing

Client hooks use standard `bun:test` (no Effect). Use `@testing-library/react` with `renderHook`:

```typescript
import { describe, expect, it, beforeEach } from "bun:test"
import { renderHook, act } from "@testing-library/react"
import { useMidi } from "../useMidi.js"

describe("useMidi", () => {
  beforeEach(() => {
    // Setup mock WebMIDI API
  })

  it("calls onNoteOn when MIDI note received", () => {
    const onNoteOn = vi.fn()
    const { result } = renderHook(() => useMidi({ onNoteOn }))

    act(() => {
      // Simulate MIDI event via mock
      result.current.simulateNoteOn(60, 100)
    })

    expect(onNoteOn).toHaveBeenCalledWith(60, 100)
  })
})
```

#### Component Testing

Use `@testing-library/react` with `render`:

```typescript
import { describe, expect, it } from "bun:test"
import { render, screen, waitFor } from "@testing-library/react"
import { CountdownOverlay } from "../CountdownOverlay.js"

describe("CountdownOverlay", () => {
  it("displays countdown number", () => {
    render(<CountdownOverlay count={3} />)
    expect(screen.getByText("3")).toBeInTheDocument()
  })
})
```

#### Mocking Strategy

| Dependency | Mock Strategy |
|------------|---------------|
| Verovio | Mock WASM module |
| Tone.js | Mock Sampler class |
| WebMIDI API | Mock navigator.requestMIDIAccess |
| fetch | Mock server responses |

---

## Test Infrastructure Needed

### Server (Effect-based)

Existing infrastructure in `packages/server/tests/helpers/`:
- `test-db.ts` - In-memory SQLite layer, `setupTables`, `clearTables`, `makeTestLayer()`

New infrastructure needed:
- [ ] `test-http.ts` - Layer for testing HTTP routes without starting server
- [ ] `fixtures/` - More MusicXML test files

Pattern for HTTP route testing:
```typescript
import { describe, expect, it } from "@codeforbreakfast/bun-test-effect"
import { Effect, Layer, pipe } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "@effect/platform"
import { pieceRoutes } from "../src/api/routes/piece.js"
import { makeTestLayer, setupTables, clearTables } from "./helpers/test-db.js"

// Build service dependencies (same as server.ts but with test DB)
const RepoLayer = pipe(
  Layer.mergeAll(PieceRepoLive, AttemptRepoLive),
  Layer.provideMerge(SqliteTestLayer)
)
const ServiceLayer = Layer.mergeAll(RepoLayer, MusicXmlServiceLive)

// Mount routes for testing
const testRouter = HttpRouter.empty.pipe(
  HttpRouter.mount("/api/piece", pieceRoutes)
)

describe("piece routes", () => {
  it.effect("GET /api/piece returns list", () =>
    Effect.gen(function* () {
      yield* setupTables
      yield* clearTables

      // Create test request
      const request = HttpServerRequest.make({
        method: "GET",
        url: "/api/piece",
      })

      // Run router with request context
      const response = yield* testRouter.pipe(
        Effect.provideService(HttpServerRequest.HttpServerRequest, request)
      )
      expect(response.status).toBe(200)
    }).pipe(Effect.provide(ServiceLayer))
  )
})
```

### Client (React/Bun)

Existing infrastructure:
- `test-setup.ts` - Happy DOM registration (preload)

New infrastructure needed:
- [ ] `mocks/verovio.ts` - Mock Verovio WASM module
- [ ] `mocks/tone.ts` - Mock Tone.js Sampler
- [ ] `mocks/webmidi.ts` - Mock navigator.requestMIDIAccess
- [ ] `test-utils.tsx` - Wrapper component with common providers

---

## Implementation Order

### Phase 1: Server API Routes
1. `piece.ts` routes (CRUD operations)
2. `session.ts` routes (practice flow)
3. `server.ts` error handling

### Phase 2: Client Hooks
1. `useSession.ts` (core state machine)
2. `useMidi.ts` (MIDI input)
3. `useAudio.ts` (audio output)
4. `usePiece.ts` (data fetching)
5. `usePlayhead.ts` (animation)
6. `usePlayedNotes.ts` (tracking)
7. `useVerovio.ts` (rendering)

### Phase 3: Client Components
1. `PracticeControls.tsx`
2. `CountdownOverlay.tsx`
3. `ResultsOverlay.tsx`
4. `SheetMusicView.tsx`
5. `PlayedNoteIndicators.tsx`
6. `Playhead.tsx`
7. `MidiStatusBadge.tsx`

### Phase 4: Pages & Integration
1. `Library.tsx` page
2. `Practice.tsx` page
3. Client-server integration tests

---

## Open Questions

1. **Coverage tool**: Use `bun test --coverage` or external tool?
2. **E2E tests**: Include browser automation (Playwright)?
3. **Visual regression**: Snapshot tests for components?
4. **Performance tests**: Measure timing-sensitive code?
5. **Mocking depth**: How much to mock vs. use real implementations?

---

## Success Criteria

- [ ] All source files have corresponding test files
- [ ] `bun test` runs all tests in < 10s
- [ ] Coverage report shows 100% line coverage
- [ ] Tests run in CI on every PR
- [ ] No flaky tests
