import { describe, expect, it } from "@codeforbreakfast/bun-test-effect"
import { Effect, Layer } from "effect"
import {
  SessionService,
  SessionServiceLive,
} from "../src/services/session.js"
import { ComparisonServiceLive } from "../src/services/comparison.js"
import { PieceRepoLive } from "../src/repos/piece-repo.js"
import { AttemptRepoLive } from "../src/repos/attempt-repo.js"
import { makeTestLayer, setupTables, clearTables } from "./helpers/test-db.js"
import { PieceRepo } from "../src/repos/piece-repo.js"
import { PieceId } from "@etude/shared"

// Build the layer with proper dependency graph
// SessionServiceLive depends on PieceRepo, AttemptRepo, and ComparisonService
const DepsLayer = Layer.mergeAll(
  PieceRepoLive,
  AttemptRepoLive,
  ComparisonServiceLive
)

const SessionLayer = SessionServiceLive.pipe(Layer.provide(DepsLayer))

const TestLayer = makeTestLayer(
  Layer.merge(DepsLayer, SessionLayer)
)

describe("SessionService", () => {
  describe("startSession", () => {
    it.effect("starts a new session", () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables

        const pieceRepo = yield* PieceRepo
        const sessionService = yield* SessionService

        // Create a piece with notes
        const notesJson = JSON.stringify([
          { pitch: 60, startTime: 0, duration: 500, measure: 1, hand: "right" },
          {
            pitch: 62,
            startTime: 500,
            duration: 500,
            measure: 1,
            hand: "right",
          },
          {
            pitch: 64,
            startTime: 1000,
            duration: 500,
            measure: 2,
            hand: "right",
          },
        ])

        const piece = yield* pieceRepo.create({
          name: "Test Piece",
          composer: null,
          filePath: "/test.xml",
          totalMeasures: 2,
          difficulty: null,
          notesJson,
        })

        const result = yield* sessionService.startSession(
          piece.id,
          1,
          2,
          "both",
          100
        )

        expect(result.sessionId).toBeDefined()
        expect(result.expectedNoteCount).toBe(3)
        expect(result.measureRange).toEqual([1, 2])
      }).pipe(Effect.provide(TestLayer))
    )

    it.effect("fails when session already active", () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables

        const pieceRepo = yield* PieceRepo
        const sessionService = yield* SessionService

        const notesJson = JSON.stringify([
          { pitch: 60, startTime: 0, duration: 500, measure: 1, hand: "right" },
        ])

        const piece = yield* pieceRepo.create({
          name: "Test Piece",
          composer: null,
          filePath: "/test.xml",
          totalMeasures: 1,
          difficulty: null,
          notesJson,
        })

        yield* sessionService.startSession(piece.id, 1, 1, "both", 100)

        const error = yield* sessionService
          .startSession(piece.id, 1, 1, "both", 100)
          .pipe(Effect.flip)

        expect(error._tag).toBe("SessionError")
        expect(error.reason).toBe("AlreadyActive")
      }).pipe(Effect.provide(TestLayer))
    )

    it.effect("fails when piece not found", () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables

        const sessionService = yield* SessionService

        const error = yield* sessionService
          .startSession("nonexistent" as PieceId, 1, 1, "both", 100)
          .pipe(Effect.flip)

        expect(error._tag).toBe("PieceNotFound")
      }).pipe(Effect.provide(TestLayer))
    )

    it.effect("filters notes by measure range", () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables

        const pieceRepo = yield* PieceRepo
        const sessionService = yield* SessionService

        const notesJson = JSON.stringify([
          { pitch: 60, startTime: 0, duration: 500, measure: 1, hand: "right" },
          {
            pitch: 62,
            startTime: 500,
            duration: 500,
            measure: 2,
            hand: "right",
          },
          {
            pitch: 64,
            startTime: 1000,
            duration: 500,
            measure: 3,
            hand: "right",
          },
        ])

        const piece = yield* pieceRepo.create({
          name: "Test Piece",
          composer: null,
          filePath: "/test.xml",
          totalMeasures: 3,
          difficulty: null,
          notesJson,
        })

        // Only practice measures 1-2
        const result = yield* sessionService.startSession(
          piece.id,
          1,
          2,
          "both",
          100
        )

        expect(result.expectedNoteCount).toBe(2) // Only notes in measures 1-2
      }).pipe(Effect.provide(TestLayer))
    )

    it.effect("filters notes by hand", () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables

        const pieceRepo = yield* PieceRepo
        const sessionService = yield* SessionService

        const notesJson = JSON.stringify([
          { pitch: 60, startTime: 0, duration: 500, measure: 1, hand: "right" },
          { pitch: 48, startTime: 0, duration: 500, measure: 1, hand: "left" },
        ])

        const piece = yield* pieceRepo.create({
          name: "Test Piece",
          composer: null,
          filePath: "/test.xml",
          totalMeasures: 1,
          difficulty: null,
          notesJson,
        })

        // Only practice right hand
        const result = yield* sessionService.startSession(
          piece.id,
          1,
          1,
          "right",
          100
        )

        expect(result.expectedNoteCount).toBe(1)
      }).pipe(Effect.provide(TestLayer))
    )
  })

  describe("submitNote", () => {
    it.effect("fails when no session active", () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables

        const sessionService = yield* SessionService

        const error = yield* sessionService
          .submitNote(60, 80, 0, true)
          .pipe(Effect.flip)

        expect(error._tag).toBe("SessionError")
        expect(error.reason).toBe("NotStarted")
      }).pipe(Effect.provide(TestLayer))
    )

    it.effect("matches correct note", () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables

        const pieceRepo = yield* PieceRepo
        const sessionService = yield* SessionService

        const notesJson = JSON.stringify([
          { pitch: 60, startTime: 0, duration: 500, measure: 1, hand: "right" },
        ])

        const piece = yield* pieceRepo.create({
          name: "Test Piece",
          composer: null,
          filePath: "/test.xml",
          totalMeasures: 1,
          difficulty: null,
          notesJson,
        })

        yield* sessionService.startSession(piece.id, 1, 1, "both", 100)

        const result = yield* sessionService.submitNote(60, 80, 0, true)

        expect(result.result).toBe("correct")
        expect(result.pitch).toBe(60)
      }).pipe(Effect.provide(TestLayer))
    )

    it.effect("identifies wrong note", () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables

        const pieceRepo = yield* PieceRepo
        const sessionService = yield* SessionService

        const notesJson = JSON.stringify([
          { pitch: 60, startTime: 0, duration: 500, measure: 1, hand: "right" },
        ])

        const piece = yield* pieceRepo.create({
          name: "Test Piece",
          composer: null,
          filePath: "/test.xml",
          totalMeasures: 1,
          difficulty: null,
          notesJson,
        })

        yield* sessionService.startSession(piece.id, 1, 1, "both", 100)

        const result = yield* sessionService.submitNote(63, 80, 0, true)

        expect(result.result).toBe("wrong")
      }).pipe(Effect.provide(TestLayer))
    )
  })

  describe("endSession", () => {
    it.effect("fails when no session active", () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables

        const sessionService = yield* SessionService

        const error = yield* sessionService.endSession().pipe(Effect.flip)

        expect(error._tag).toBe("SessionError")
        expect(error.reason).toBe("NotStarted")
      }).pipe(Effect.provide(TestLayer))
    )

    it.effect("calculates final score and saves attempt", () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables

        const pieceRepo = yield* PieceRepo
        const sessionService = yield* SessionService

        const notesJson = JSON.stringify([
          { pitch: 60, startTime: 0, duration: 500, measure: 1, hand: "right" },
          {
            pitch: 62,
            startTime: 500,
            duration: 500,
            measure: 1,
            hand: "right",
          },
        ])

        const piece = yield* pieceRepo.create({
          name: "Test Piece",
          composer: null,
          filePath: "/test.xml",
          totalMeasures: 1,
          difficulty: null,
          notesJson,
        })

        yield* sessionService.startSession(piece.id, 1, 1, "both", 100)

        // Play perfect performance
        yield* sessionService.submitNote(60, 80, 0, true)
        yield* sessionService.submitNote(62, 80, 500, true)

        const result = yield* sessionService.endSession()

        expect(result.attemptId).toBeDefined()
        expect(result.noteAccuracy).toBe(1)
        expect(result.combinedScore).toBe(100)
        expect(result.missedNotes.length).toBe(0)
        expect(result.extraNotes).toBe(0)
      }).pipe(Effect.provide(TestLayer))
    )

    it.effect("clears session state after ending", () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables

        const pieceRepo = yield* PieceRepo
        const sessionService = yield* SessionService

        const notesJson = JSON.stringify([
          { pitch: 60, startTime: 0, duration: 500, measure: 1, hand: "right" },
        ])

        const piece = yield* pieceRepo.create({
          name: "Test Piece",
          composer: null,
          filePath: "/test.xml",
          totalMeasures: 1,
          difficulty: null,
          notesJson,
        })

        yield* sessionService.startSession(piece.id, 1, 1, "both", 100)
        yield* sessionService.submitNote(60, 80, 0, true)
        yield* sessionService.endSession()

        // Should be able to start a new session now
        const newResult = yield* sessionService.startSession(
          piece.id,
          1,
          1,
          "both",
          100
        )
        expect(newResult.sessionId).toBeDefined()
      }).pipe(Effect.provide(TestLayer))
    )
  })

  describe("getState", () => {
    it.effect("returns null when no session", () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables

        const sessionService = yield* SessionService
        const state = yield* sessionService.getState()

        expect(state).toBeNull()
      }).pipe(Effect.provide(TestLayer))
    )

    it.effect("returns current session state", () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables

        const pieceRepo = yield* PieceRepo
        const sessionService = yield* SessionService

        const notesJson = JSON.stringify([
          { pitch: 60, startTime: 0, duration: 500, measure: 1, hand: "right" },
        ])

        const piece = yield* pieceRepo.create({
          name: "Test Piece",
          composer: null,
          filePath: "/test.xml",
          totalMeasures: 1,
          difficulty: null,
          notesJson,
        })

        yield* sessionService.startSession(piece.id, 1, 1, "both", 100)

        const state = yield* sessionService.getState()

        expect(state).not.toBeNull()
        expect(state!.pieceId).toBe(piece.id)
        expect(state!.hand).toBe("both")
        expect(state!.tempo).toBe(100)
      }).pipe(Effect.provide(TestLayer))
    )
  })
})
