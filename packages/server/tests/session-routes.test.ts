import { describe, expect, it } from "@codeforbreakfast/bun-test-effect"
import { Effect } from "effect"
import {
  TestServiceLayer,
  makeRequest,
  runRequestJson,
} from "./helpers/test-http.js"
import { setupTables } from "./helpers/test-db.js"
import { PieceRepo } from "../src/repos/piece-repo.js"
import { NoteEvent, Milliseconds, MidiPitch } from "@etude/shared"
import { Option } from "effect"

// Helper to create a piece directly via repo
const createTestPiece = (id = "test-piece-id") =>
  Effect.gen(function* () {
    const pieceRepo = yield* PieceRepo

    // Create notes for testing - C4 D4 E4 F4 in measure 1
    const notes: NoteEvent[] = [
      new NoteEvent({
        pitch: 60 as MidiPitch, // C4
        startTime: 0 as Milliseconds,
        duration: 500 as Milliseconds,
        measure: 1,
        hand: "right" as const,
        voice: Option.none(),
      }),
      new NoteEvent({
        pitch: 62 as MidiPitch, // D4
        startTime: 500 as Milliseconds,
        duration: 500 as Milliseconds,
        measure: 1,
        hand: "right" as const,
        voice: Option.none(),
      }),
      new NoteEvent({
        pitch: 64 as MidiPitch, // E4
        startTime: 1000 as Milliseconds,
        duration: 500 as Milliseconds,
        measure: 1,
        hand: "right" as const,
        voice: Option.none(),
      }),
      new NoteEvent({
        pitch: 65 as MidiPitch, // F4
        startTime: 1500 as Milliseconds,
        duration: 500 as Milliseconds,
        measure: 1,
        hand: "right" as const,
        voice: Option.none(),
      }),
      // Left hand note in measure 2
      new NoteEvent({
        pitch: 48 as MidiPitch, // C3
        startTime: 2000 as Milliseconds,
        duration: 1000 as Milliseconds,
        measure: 2,
        hand: "left" as const,
        voice: Option.none(),
      }),
    ]

    const piece = yield* pieceRepo.create({
      name: "Test Piece",
      composer: "Test Composer",
      filePath: `/test/${id}.xml`,
      totalMeasures: 2,
      difficulty: null,
      notesJson: JSON.stringify(notes),
    })

    return piece
  })

describe("Session Routes", () => {
  describe("GET /api/session/state", () => {
    it.effect("returns inactive when no session", () =>
      Effect.gen(function* () {
        yield* setupTables

        const request = makeRequest("GET", "/api/session/state")
        const { response, json } = yield* runRequestJson(request)

        expect(response.status).toBe(200)
        expect(json.active).toBe(false)
      }).pipe(Effect.provide(TestServiceLayer))
    )
  })

  describe("POST /api/session/start", () => {
    it.effect("starts a session with valid piece", () =>
      Effect.gen(function* () {
        yield* setupTables
        const piece = yield* createTestPiece()

        const request = makeRequest("POST", "/api/session/start", {
          pieceId: piece.id,
          measureStart: 1,
          measureEnd: 2,
          hand: "both",
          tempo: 100,
        })
        const { response, json } = yield* runRequestJson(request)

        expect(response.status).toBe(200)
        expect(json.sessionId).toBeDefined()
        expect(json.expectedNoteCount).toBe(5)
        expect(json.measureRange).toEqual([1, 2])
      }).pipe(Effect.provide(TestServiceLayer))
    )

    it.effect("filters notes by hand", () =>
      Effect.gen(function* () {
        yield* setupTables
        const piece = yield* createTestPiece()

        const request = makeRequest("POST", "/api/session/start", {
          pieceId: piece.id,
          measureStart: 1,
          measureEnd: 2,
          hand: "right",
          tempo: 100,
        })
        const { response, json } = yield* runRequestJson(request)

        expect(response.status).toBe(200)
        expect(json.expectedNoteCount).toBe(4) // only right hand notes
      }).pipe(Effect.provide(TestServiceLayer))
    )

    it.effect("filters notes by measure range", () =>
      Effect.gen(function* () {
        yield* setupTables
        const piece = yield* createTestPiece()

        const request = makeRequest("POST", "/api/session/start", {
          pieceId: piece.id,
          measureStart: 2,
          measureEnd: 2,
          hand: "both",
          tempo: 100,
        })
        const { response, json } = yield* runRequestJson(request)

        expect(response.status).toBe(200)
        expect(json.expectedNoteCount).toBe(1) // only measure 2 note
      }).pipe(Effect.provide(TestServiceLayer))
    )

    it.effect("returns 400 for non-existent piece", () =>
      Effect.gen(function* () {
        yield* setupTables

        const request = makeRequest("POST", "/api/session/start", {
          pieceId: "non-existent-id",
          measureStart: 1,
          measureEnd: 2,
          hand: "both",
          tempo: 100,
        })
        const { response, json } = yield* runRequestJson(request)

        expect(response.status).toBe(400)
        expect(json.error).toBeDefined()
      }).pipe(Effect.provide(TestServiceLayer))
    )

    it.effect("returns 400 for missing required fields", () =>
      Effect.gen(function* () {
        yield* setupTables

        const request = makeRequest("POST", "/api/session/start", {
          pieceId: "test-id",
          // missing other fields
        })
        const { response, json } = yield* runRequestJson(request)

        expect(response.status).toBe(400)
        expect(json.error).toBeDefined()
      }).pipe(Effect.provide(TestServiceLayer))
    )

    it.effect("returns 400 when session already active", () =>
      Effect.gen(function* () {
        yield* setupTables
        const piece = yield* createTestPiece()

        // Start first session
        const firstRequest = makeRequest("POST", "/api/session/start", {
          pieceId: piece.id,
          measureStart: 1,
          measureEnd: 2,
          hand: "both",
          tempo: 100,
        })
        yield* runRequestJson(firstRequest)

        // Try to start second session
        const secondRequest = makeRequest("POST", "/api/session/start", {
          pieceId: piece.id,
          measureStart: 1,
          measureEnd: 2,
          hand: "both",
          tempo: 100,
        })
        const { response, json } = yield* runRequestJson(secondRequest)

        expect(response.status).toBe(400)
        expect(json.error).toContain("AlreadyActive")
      }).pipe(Effect.provide(TestServiceLayer))
    )
  })

  describe("POST /api/session/note", () => {
    it.effect("returns 400 when no session active", () =>
      Effect.gen(function* () {
        yield* setupTables

        const request = makeRequest("POST", "/api/session/note", {
          pitch: 60,
          velocity: 80,
          timestamp: 0,
          on: true,
        })
        const { response, json } = yield* runRequestJson(request)

        expect(response.status).toBe(400)
        expect(json.error).toContain("NotStarted")
      }).pipe(Effect.provide(TestServiceLayer))
    )

    it.effect("submits correct note", () =>
      Effect.gen(function* () {
        yield* setupTables
        const piece = yield* createTestPiece()

        // Start session
        const startRequest = makeRequest("POST", "/api/session/start", {
          pieceId: piece.id,
          measureStart: 1,
          measureEnd: 1,
          hand: "right",
          tempo: 100,
        })
        yield* runRequestJson(startRequest)

        // Submit correct note (C4 = 60)
        const noteRequest = makeRequest("POST", "/api/session/note", {
          pitch: 60,
          velocity: 80,
          timestamp: 0,
          on: true,
        })
        const { response, json } = yield* runRequestJson(noteRequest)

        expect(response.status).toBe(200)
        expect(json.pitch).toBe(60)
        expect(json.result).toBe("correct")
      }).pipe(Effect.provide(TestServiceLayer))
    )

    it.effect("submits wrong note", () =>
      Effect.gen(function* () {
        yield* setupTables
        const piece = yield* createTestPiece()

        // Start session
        const startRequest = makeRequest("POST", "/api/session/start", {
          pieceId: piece.id,
          measureStart: 1,
          measureEnd: 1,
          hand: "right",
          tempo: 100,
        })
        yield* runRequestJson(startRequest)

        // Submit wrong note (A4 = 69 instead of C4 = 60)
        const noteRequest = makeRequest("POST", "/api/session/note", {
          pitch: 69,
          velocity: 80,
          timestamp: 0,
          on: true,
        })
        const { response, json } = yield* runRequestJson(noteRequest)

        expect(response.status).toBe(200)
        expect(json.pitch).toBe(69)
        expect(json.result).toBe("wrong")
      }).pipe(Effect.provide(TestServiceLayer))
    )

    it.effect("handles note-off events", () =>
      Effect.gen(function* () {
        yield* setupTables
        const piece = yield* createTestPiece()

        // Start session
        const startRequest = makeRequest("POST", "/api/session/start", {
          pieceId: piece.id,
          measureStart: 1,
          measureEnd: 1,
          hand: "right",
          tempo: 100,
        })
        yield* runRequestJson(startRequest)

        // Submit note-off
        const noteRequest = makeRequest("POST", "/api/session/note", {
          pitch: 60,
          velocity: 0,
          timestamp: 500,
          on: false,
        })
        const { response, json } = yield* runRequestJson(noteRequest)

        expect(response.status).toBe(200)
        expect(json.pitch).toBe(60)
      }).pipe(Effect.provide(TestServiceLayer))
    )
  })

  describe("POST /api/session/end", () => {
    it.effect("returns 400 when no session active", () =>
      Effect.gen(function* () {
        yield* setupTables

        const request = makeRequest("POST", "/api/session/end")
        const { response, json } = yield* runRequestJson(request)

        expect(response.status).toBe(400)
        expect(json.error).toContain("NotStarted")
      }).pipe(Effect.provide(TestServiceLayer))
    )

    it.effect("ends session and returns results", () =>
      Effect.gen(function* () {
        yield* setupTables
        const piece = yield* createTestPiece()

        // Start session
        const startRequest = makeRequest("POST", "/api/session/start", {
          pieceId: piece.id,
          measureStart: 1,
          measureEnd: 1,
          hand: "right",
          tempo: 100,
        })
        yield* runRequestJson(startRequest)

        // End session without playing notes
        const endRequest = makeRequest("POST", "/api/session/end")
        const { response, json } = yield* runRequestJson(endRequest)

        expect(response.status).toBe(200)
        expect(json.attemptId).toBeDefined()
        expect(json.noteAccuracy).toBe(0) // no notes played
        expect(json.missedNotes).toHaveLength(4)
      }).pipe(Effect.provide(TestServiceLayer))
    )

    it.effect("calculates accuracy for played notes", () =>
      Effect.gen(function* () {
        yield* setupTables
        const piece = yield* createTestPiece()

        // Start session
        const startRequest = makeRequest("POST", "/api/session/start", {
          pieceId: piece.id,
          measureStart: 1,
          measureEnd: 1,
          hand: "right",
          tempo: 100,
        })
        yield* runRequestJson(startRequest)

        // Play all correct notes
        for (const pitch of [60, 62, 64, 65]) {
          const noteRequest = makeRequest("POST", "/api/session/note", {
            pitch,
            velocity: 80,
            timestamp: (pitch - 60) * 250, // roughly timed
            on: true,
          })
          yield* runRequestJson(noteRequest)
        }

        // End session
        const endRequest = makeRequest("POST", "/api/session/end")
        const { response, json } = yield* runRequestJson(endRequest)

        expect(response.status).toBe(200)
        expect(json.noteAccuracy).toBe(1) // 100% accuracy
        expect(json.missedNotes).toHaveLength(0)
      }).pipe(Effect.provide(TestServiceLayer))
    )

    it.effect("clears session state after ending", () =>
      Effect.gen(function* () {
        yield* setupTables
        const piece = yield* createTestPiece()

        // Start and end session
        const startRequest = makeRequest("POST", "/api/session/start", {
          pieceId: piece.id,
          measureStart: 1,
          measureEnd: 1,
          hand: "right",
          tempo: 100,
        })
        yield* runRequestJson(startRequest)

        const endRequest = makeRequest("POST", "/api/session/end")
        yield* runRequestJson(endRequest)

        // Verify state is cleared
        const stateRequest = makeRequest("GET", "/api/session/state")
        const { json } = yield* runRequestJson(stateRequest)

        expect(json.active).toBe(false)
      }).pipe(Effect.provide(TestServiceLayer))
    )
  })

  describe("GET /api/session/state", () => {
    it.effect("returns session state when active", () =>
      Effect.gen(function* () {
        yield* setupTables
        const piece = yield* createTestPiece()

        // Start session
        const startRequest = makeRequest("POST", "/api/session/start", {
          pieceId: piece.id,
          measureStart: 1,
          measureEnd: 2,
          hand: "both",
          tempo: 100,
        })
        yield* runRequestJson(startRequest)

        // Get state
        const stateRequest = makeRequest("GET", "/api/session/state")
        const { response, json } = yield* runRequestJson(stateRequest)

        expect(response.status).toBe(200)
        expect(json.active).toBe(true)
        expect(json.pieceId).toBe(piece.id)
        expect(json.expectedNoteCount).toBe(5)
        expect(json.playedNoteCount).toBe(0)
        expect(json.matchedCount).toBe(0)
        expect(json.measureRange).toEqual([1, 2])
        expect(json.hand).toBe("both")
        expect(json.tempo).toBe(100)
      }).pipe(Effect.provide(TestServiceLayer))
    )

    it.effect("updates state after submitting notes", () =>
      Effect.gen(function* () {
        yield* setupTables
        const piece = yield* createTestPiece()

        // Start session
        const startRequest = makeRequest("POST", "/api/session/start", {
          pieceId: piece.id,
          measureStart: 1,
          measureEnd: 1,
          hand: "right",
          tempo: 100,
        })
        yield* runRequestJson(startRequest)

        // Submit a note
        const noteRequest = makeRequest("POST", "/api/session/note", {
          pitch: 60,
          velocity: 80,
          timestamp: 0,
          on: true,
        })
        yield* runRequestJson(noteRequest)

        // Get state
        const stateRequest = makeRequest("GET", "/api/session/state")
        const { json } = yield* runRequestJson(stateRequest)

        expect(json.playedNoteCount).toBe(1)
        expect(json.matchedCount).toBe(1)
      }).pipe(Effect.provide(TestServiceLayer))
    )
  })

  describe("POST /api/session/simulate", () => {
    it.effect("returns 400 when no session active", () =>
      Effect.gen(function* () {
        yield* setupTables

        const request = makeRequest("POST", "/api/session/simulate", {
          notes: [{ pitch: 60, timestamp: 0 }],
        })
        const { response, json } = yield* runRequestJson(request)

        expect(response.status).toBe(400)
        expect(json.error).toContain("NotStarted")
      }).pipe(Effect.provide(TestServiceLayer))
    )

    it.effect("simulates multiple notes", () =>
      Effect.gen(function* () {
        yield* setupTables
        const piece = yield* createTestPiece()

        // Start session
        const startRequest = makeRequest("POST", "/api/session/start", {
          pieceId: piece.id,
          measureStart: 1,
          measureEnd: 1,
          hand: "right",
          tempo: 100,
        })
        yield* runRequestJson(startRequest)

        // Simulate notes
        const simRequest = makeRequest("POST", "/api/session/simulate", {
          notes: [
            { pitch: 60, timestamp: 0 },
            { pitch: 62, timestamp: 500 },
            { pitch: 64, timestamp: 1000 },
            { pitch: 65, timestamp: 1500 },
          ],
        })
        const { response, json } = yield* runRequestJson(simRequest)

        expect(response.status).toBe(200)
        expect(json.submitted).toBe(4)
        expect(json.results).toHaveLength(4)
      }).pipe(Effect.provide(TestServiceLayer))
    )
  })

  describe("GET /api/session/expected", () => {
    it.effect("returns 400 when no session active", () =>
      Effect.gen(function* () {
        yield* setupTables

        const request = makeRequest("GET", "/api/session/expected")
        const { response, json } = yield* runRequestJson(request)

        expect(response.status).toBe(400)
        expect(json.error).toBe("No active session")
      }).pipe(Effect.provide(TestServiceLayer))
    )

    it.effect("returns expected notes for active session", () =>
      Effect.gen(function* () {
        yield* setupTables
        const piece = yield* createTestPiece()

        // Start session
        const startRequest = makeRequest("POST", "/api/session/start", {
          pieceId: piece.id,
          measureStart: 1,
          measureEnd: 1,
          hand: "right",
          tempo: 100,
        })
        yield* runRequestJson(startRequest)

        // Get expected notes
        const expectedRequest = makeRequest("GET", "/api/session/expected")
        const { response, json } = yield* runRequestJson(expectedRequest)

        expect(response.status).toBe(200)
        expect(json.notes).toHaveLength(4)
        expect(json.notes[0].pitch).toBe(60) // C4
        expect(json.notes[0].hand).toBe("right")
      }).pipe(Effect.provide(TestServiceLayer))
    )
  })
})
