import { Effect, Schema } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "@effect/platform"
import { SessionService } from "../../services/session.js"
import { PieceId, Hand } from "@etude/shared"

// Request schemas
const StartSessionRequest = Schema.Struct({
  pieceId: Schema.String,
  measureStart: Schema.Number,
  measureEnd: Schema.Number,
  hand: Schema.Union(
    Schema.Literal("left"),
    Schema.Literal("right"),
    Schema.Literal("both")
  ),
  tempo: Schema.Number,
})


// For simulating a sequence of notes (testing)
const SimulateNotesRequest = Schema.Struct({
  notes: Schema.Array(
    Schema.Struct({
      pitch: Schema.Number,
      timestamp: Schema.Number,
    })
  ),
})

// POST /start - Start a new session
const startSession = Effect.gen(function* () {
  const req = yield* HttpServerRequest.HttpServerRequest
  const body = yield* req.json
  const parsed = yield* Schema.decodeUnknown(StartSessionRequest)(body)
  const session = yield* SessionService

  const result = yield* session.startSession(
    parsed.pieceId as PieceId,
    parsed.measureStart,
    parsed.measureEnd,
    parsed.hand as Hand,
    parsed.tempo
  )

  return yield* HttpServerResponse.json(result)
}).pipe(
  Effect.catchAll((error) =>
    HttpServerResponse.json({ error: String(error) }, { status: 400 })
  )
)


// POST /end - End session and get results
const endSession = Effect.gen(function* () {
  const session = yield* SessionService
  const result = yield* session.endSession()
  return yield* HttpServerResponse.json(result)
}).pipe(
  Effect.catchAll((error) =>
    HttpServerResponse.json({ error: String(error) }, { status: 400 })
  )
)

// GET /state - Get current session state
const getState = Effect.gen(function* () {
  const session = yield* SessionService
  const state = yield* session.getState()

  if (state === null) {
    return yield* HttpServerResponse.json({ active: false })
  }

  return yield* HttpServerResponse.json({
    active: true,
    sessionId: state.sessionId,
    pieceId: state.pieceId,
    expectedNoteCount: state.expectedNotes.length,
    playedNoteCount: state.playedNotes.length,
    matchedCount: state.matchedIndices.size,
    measureRange: [state.measureStart, state.measureEnd],
    hand: state.hand,
    tempo: state.tempo,
  })
}).pipe(
  Effect.catchAll((error) =>
    HttpServerResponse.json({ error: String(error) }, { status: 400 })
  )
)

// POST /simulate - Submit a sequence of notes for testing
// Notes should have pitch and timestamp (relative, first note at 0)
const simulateNotes = Effect.gen(function* () {
  const req = yield* HttpServerRequest.HttpServerRequest
  const body = yield* req.json
  const parsed = yield* Schema.decodeUnknown(SimulateNotesRequest)(body)
  const session = yield* SessionService

  const results = []
  for (const note of parsed.notes) {
    const result = yield* session.submitNote(note.pitch, 80, note.timestamp, true)
    results.push(result)
  }

  return yield* HttpServerResponse.json({ submitted: results.length, results })
}).pipe(
  Effect.catchAll((error) =>
    HttpServerResponse.json({ error: String(error) }, { status: 400 })
  )
)

// GET /expected - Get expected notes for current session (for testing)
const getExpected = Effect.gen(function* () {
  const session = yield* SessionService
  const state = yield* session.getState()

  if (state === null) {
    return yield* HttpServerResponse.json({ error: "No active session" }, { status: 400 })
  }

  return yield* HttpServerResponse.json({
    notes: state.expectedNotes.map((n) => ({
      pitch: n.pitch,
      timestamp: n.startTime,
      hand: n.hand,
    })),
  })
}).pipe(
  Effect.catchAll((error) =>
    HttpServerResponse.json({ error: String(error) }, { status: 400 })
  )
)

export const sessionRoutes = HttpRouter.empty.pipe(
  HttpRouter.post("/start", startSession),
  HttpRouter.post("/end", endSession),
  HttpRouter.get("/state", getState),
  HttpRouter.post("/simulate", simulateNotes),
  HttpRouter.get("/expected", getExpected)
)
