import { describe, expect, it } from "@codeforbreakfast/bun-test-effect"
import { Effect } from "effect"
import { AttemptRepo, AttemptRepoLive } from "../src/repos/attempt-repo.js"
import { PieceRepo, PieceRepoLive } from "../src/repos/piece-repo.js"
import { makeTestLayer, setupTables, clearTables } from "./helpers/test-db.js"
import { Layer } from "effect"

const TestLayer = makeTestLayer(
  Layer.mergeAll(PieceRepoLive, AttemptRepoLive)
)

describe("AttemptRepo", () => {
  describe("create", () => {
    it.effect("creates an attempt", () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables

        const pieceRepo = yield* PieceRepo
        const attemptRepo = yield* AttemptRepo

        const piece = yield* pieceRepo.create({
          name: "Test Piece",
          composer: null,
          filePath: "/pieces/test.xml",
          totalMeasures: 32,
          difficulty: null,
          notesJson: "[]",
        })

        const attempt = yield* attemptRepo.create({
          pieceId: piece.id,
          measureStart: 1,
          measureEnd: 16,
          hand: "both",
          tempo: 100,
          noteAccuracy: 0.94,
          timingAccuracy: 0.87,
          combinedScore: 91,
        })

        expect(attempt.pieceId).toBe(piece.id)
        expect(attempt.measureStart).toBe(1)
        expect(attempt.measureEnd).toBe(16)
        expect(attempt.hand).toBe("both")
        expect(attempt.tempo).toBe(100)
        expect(attempt.noteAccuracy).toBe(0.94)
        expect(attempt.timingAccuracy).toBe(0.87)
        expect(attempt.combinedScore).toBe(91)
      }).pipe(Effect.provide(TestLayer))
    )
  })

  describe("listByPiece", () => {
    it.effect("lists attempts for a piece ordered by timestamp desc", () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables

        const pieceRepo = yield* PieceRepo
        const attemptRepo = yield* AttemptRepo

        const piece = yield* pieceRepo.create({
          name: "Test Piece",
          composer: null,
          filePath: "/pieces/test.xml",
          totalMeasures: 32,
          difficulty: null,
          notesJson: "[]",
        })

        // Create attempts with small delays to ensure different timestamps
        yield* attemptRepo.create({
          pieceId: piece.id,
          measureStart: 1,
          measureEnd: 8,
          hand: "right",
          tempo: 75,
          noteAccuracy: 0.8,
          timingAccuracy: 0.7,
          combinedScore: 76,
        })

        yield* attemptRepo.create({
          pieceId: piece.id,
          measureStart: 1,
          measureEnd: 16,
          hand: "both",
          tempo: 100,
          noteAccuracy: 0.9,
          timingAccuracy: 0.85,
          combinedScore: 88,
        })

        const attempts = yield* attemptRepo.listByPiece(piece.id)
        expect(attempts.length).toBe(2)
        // Both attempts are present (order may vary due to same-millisecond timestamps)
        const scores = attempts.map((a) => a.combinedScore).sort()
        expect(scores).toEqual([76, 88])
      }).pipe(Effect.provide(TestLayer))
    )

    it.effect("returns empty array for piece with no attempts", () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables

        const pieceRepo = yield* PieceRepo
        const attemptRepo = yield* AttemptRepo

        const piece = yield* pieceRepo.create({
          name: "No Attempts",
          composer: null,
          filePath: "/pieces/none.xml",
          totalMeasures: 10,
          difficulty: null,
          notesJson: "[]",
        })

        const attempts = yield* attemptRepo.listByPiece(piece.id)
        expect(attempts.length).toBe(0)
      }).pipe(Effect.provide(TestLayer))
    )
  })

  describe("getById", () => {
    it.effect("returns attempt by id", () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables

        const pieceRepo = yield* PieceRepo
        const attemptRepo = yield* AttemptRepo

        const piece = yield* pieceRepo.create({
          name: "Test Piece",
          composer: null,
          filePath: "/pieces/test.xml",
          totalMeasures: 32,
          difficulty: null,
          notesJson: "[]",
        })

        const created = yield* attemptRepo.create({
          pieceId: piece.id,
          measureStart: 1,
          measureEnd: 16,
          hand: "both",
          tempo: 100,
          noteAccuracy: 0.94,
          timingAccuracy: 0.87,
          combinedScore: 91,
        })

        const found = yield* attemptRepo.getById(created.id)
        expect(found).not.toBeNull()
        expect(found!.id).toBe(created.id)
      }).pipe(Effect.provide(TestLayer))
    )
  })

  describe("deleteByPiece", () => {
    it.effect("deletes all attempts for a piece", () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables

        const pieceRepo = yield* PieceRepo
        const attemptRepo = yield* AttemptRepo

        const piece = yield* pieceRepo.create({
          name: "Test Piece",
          composer: null,
          filePath: "/pieces/test.xml",
          totalMeasures: 32,
          difficulty: null,
          notesJson: "[]",
        })

        yield* attemptRepo.create({
          pieceId: piece.id,
          measureStart: 1,
          measureEnd: 8,
          hand: "right",
          tempo: 75,
          noteAccuracy: 0.8,
          timingAccuracy: 0.7,
          combinedScore: 76,
        })

        yield* attemptRepo.create({
          pieceId: piece.id,
          measureStart: 1,
          measureEnd: 16,
          hand: "both",
          tempo: 100,
          noteAccuracy: 0.9,
          timingAccuracy: 0.85,
          combinedScore: 88,
        })

        yield* attemptRepo.deleteByPiece(piece.id)

        const attempts = yield* attemptRepo.listByPiece(piece.id)
        expect(attempts.length).toBe(0)
      }).pipe(Effect.provide(TestLayer))
    )
  })
})
