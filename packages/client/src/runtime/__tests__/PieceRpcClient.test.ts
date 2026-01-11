import { describe, expect, it } from "@codeforbreakfast/bun-test-effect"
import { Effect, Option } from "effect"
import { RpcClient } from "@effect/rpc"
import {
  PieceRpcs,
  PieceId,
  MeasureNumber,
  MidiPitch,
  Milliseconds,
  AttemptId,
  Accuracy,
  TempoPercent,
} from "@etude/shared"
import { makeRpcTestLayer, makeRpcNetworkErrorLayer } from "./test-utils.js"

describe("PieceRpcClient", () => {
  describe("listPieces", () => {
    it.effect("returns array of Piece with all fields decoded", () =>
      Effect.gen(function* () {
        const client = yield* RpcClient.make(PieceRpcs)
        const result = yield* client.listPieces()

        expect(result).toHaveLength(2)

        const first = result[0]
        expect(first.id).toBe("piece-1" as PieceId)
        expect(first.name).toBe("Moonlight Sonata")
        expect(Option.isSome(first.composer)).toBe(true)
        if (Option.isSome(first.composer)) {
          expect(first.composer.value).toBe("Beethoven")
        }
        expect(first.filePath).toBe("/music/moonlight.musicxml")
        expect(first.totalMeasures).toBe(24 as MeasureNumber)
        expect(Option.isSome(first.difficulty)).toBe(true)
        if (Option.isSome(first.difficulty)) {
          expect(first.difficulty.value).toBe("intermediate")
        }
        expect(first.addedAt).toBeInstanceOf(Date)

        const second = result[1]
        expect(second.id).toBe("piece-2" as PieceId)
        expect(Option.isNone(second.composer)).toBe(true)
        expect(Option.isNone(second.difficulty)).toBe(true)
      }).pipe(
        Effect.scoped,
        Effect.provide(
          makeRpcTestLayer(PieceRpcs, {
            listPieces: {
              success: [
                {
                  id: "piece-1",
                  name: "Moonlight Sonata",
                  composer: "Beethoven",
                  filePath: "/music/moonlight.musicxml",
                  totalMeasures: 24,
                  difficulty: "intermediate",
                  addedAt: "2024-01-15T10:30:00.000Z",
                },
                {
                  id: "piece-2",
                  name: "Simple Melody",
                  composer: null,
                  filePath: "/music/simple.musicxml",
                  totalMeasures: 8,
                  difficulty: null,
                  addedAt: "2024-01-16T14:00:00.000Z",
                },
              ],
            },
          })
        )
      )
    )

    it.effect("returns empty array when no pieces exist", () =>
      Effect.gen(function* () {
        const client = yield* RpcClient.make(PieceRpcs)
        const result = yield* client.listPieces()
        expect(result).toHaveLength(0)
      }).pipe(
        Effect.scoped,
        Effect.provide(
          makeRpcTestLayer(PieceRpcs, {
            listPieces: { success: [] },
          })
        )
      )
    )
  })

  describe("getPiece", () => {
    it.effect("encodes payload and decodes Piece response", () =>
      Effect.gen(function* () {
        const client = yield* RpcClient.make(PieceRpcs)
        const result = yield* client.getPiece({
          id: "piece-123" as PieceId,
        })

        expect(result.id).toBe("piece-123" as PieceId)
        expect(result.name).toBe("Fur Elise")
        expect(result.totalMeasures).toBe(105 as MeasureNumber)
      }).pipe(
        Effect.scoped,
        Effect.provide(
          makeRpcTestLayer(PieceRpcs, {
            getPiece: {
              success: {
                id: "piece-123",
                name: "Fur Elise",
                composer: "Beethoven",
                filePath: "/music/fur-elise.musicxml",
                totalMeasures: 105,
                difficulty: "advanced",
                addedAt: "2024-01-10T08:00:00.000Z",
              },
            },
          })
        )
      )
    )

    it.effect("handles PieceNotFound error", () =>
      Effect.gen(function* () {
        const client = yield* RpcClient.make(PieceRpcs)
        const result = yield* client
          .getPiece({ id: "nonexistent" as PieceId })
          .pipe(Effect.either)

        expect(result._tag).toBe("Left")
        if (result._tag === "Left") {
          const error = result.left
          expect(error._tag).toBe("PieceNotFound")
          if (error._tag === "PieceNotFound") {
            expect(error.id).toBe("nonexistent" as PieceId)
          }
        }
      }).pipe(
        Effect.scoped,
        Effect.provide(
          makeRpcTestLayer(PieceRpcs, {
            getPiece: {
              error: { _tag: "PieceNotFound", id: "nonexistent" },
            },
          })
        )
      )
    )
  })

  describe("getAttempts", () => {
    it.effect("returns array of Attempt with all fields decoded", () =>
      Effect.gen(function* () {
        const client = yield* RpcClient.make(PieceRpcs)
        const result = yield* client.getAttempts({
          pieceId: "piece-123" as PieceId,
        })

        expect(result).toHaveLength(2)

        const first = result[0]
        expect(first.id).toBe("attempt-1" as AttemptId)
        expect(first.pieceId).toBe("piece-123" as PieceId)
        expect(first.timestamp).toBeInstanceOf(Date)
        expect(first.measureStart).toBe(1 as MeasureNumber)
        expect(first.measureEnd).toBe(8 as MeasureNumber)
        expect(first.hand).toBe("both")
        expect(first.tempo).toBe(100 as TempoPercent)
        expect(first.noteAccuracy).toBe(0.95 as Accuracy)
        expect(first.timingAccuracy).toBe(0.88 as Accuracy)
        expect(first.combinedScore).toBe(91.5)
      }).pipe(
        Effect.scoped,
        Effect.provide(
          makeRpcTestLayer(PieceRpcs, {
            getAttempts: {
              success: [
                {
                  id: "attempt-1",
                  pieceId: "piece-123",
                  timestamp: "2024-01-20T15:30:00.000Z",
                  measureStart: 1,
                  measureEnd: 8,
                  hand: "both",
                  tempo: 100,
                  noteAccuracy: 0.95,
                  timingAccuracy: 0.88,
                  combinedScore: 91.5,
                },
                {
                  id: "attempt-2",
                  pieceId: "piece-123",
                  timestamp: "2024-01-20T16:00:00.000Z",
                  measureStart: 1,
                  measureEnd: 8,
                  hand: "left",
                  tempo: 80,
                  noteAccuracy: 0.78,
                  timingAccuracy: 0.82,
                  combinedScore: 80.0,
                },
              ],
            },
          })
        )
      )
    )

    it.effect("returns empty array for piece with no attempts", () =>
      Effect.gen(function* () {
        const client = yield* RpcClient.make(PieceRpcs)
        const result = yield* client.getAttempts({
          pieceId: "new-piece" as PieceId,
        })
        expect(result).toHaveLength(0)
      }).pipe(
        Effect.scoped,
        Effect.provide(
          makeRpcTestLayer(PieceRpcs, {
            getAttempts: { success: [] },
          })
        )
      )
    )
  })

  describe("getPieceNotes", () => {
    it.effect("returns array of NoteEvent with all fields decoded", () =>
      Effect.gen(function* () {
        const client = yield* RpcClient.make(PieceRpcs)
        const result = yield* client.getPieceNotes({
          pieceId: "piece-123" as PieceId,
        })

        expect(result).toHaveLength(3)

        const first = result[0]
        expect(first.pitch).toBe(60 as MidiPitch)
        expect(first.startTime).toBe(0 as Milliseconds)
        expect(first.duration).toBe(500 as Milliseconds)
        expect(first.measure).toBe(1 as MeasureNumber)
        expect(first.hand).toBe("right")
        expect(Option.isNone(first.voice)).toBe(true)

        const second = result[1]
        expect(second.pitch).toBe(48 as MidiPitch)
        expect(second.hand).toBe("left")
        expect(Option.isSome(second.voice)).toBe(true)
        if (Option.isSome(second.voice)) {
          expect(second.voice.value).toBe(2)
        }
      }).pipe(
        Effect.scoped,
        Effect.provide(
          makeRpcTestLayer(PieceRpcs, {
            getPieceNotes: {
              success: [
                {
                  pitch: 60,
                  startTime: 0,
                  duration: 500,
                  measure: 1,
                  hand: "right",
                  voice: null,
                },
                {
                  pitch: 48,
                  startTime: 0,
                  duration: 1000,
                  measure: 1,
                  hand: "left",
                  voice: 2,
                },
                {
                  pitch: 64,
                  startTime: 500,
                  duration: 500,
                  measure: 1,
                  hand: "right",
                  voice: null,
                },
              ],
            },
          })
        )
      )
    )

    it.effect("handles PieceNotFound error", () =>
      Effect.gen(function* () {
        const client = yield* RpcClient.make(PieceRpcs)
        const result = yield* client
          .getPieceNotes({ pieceId: "missing" as PieceId })
          .pipe(Effect.either)

        expect(result._tag).toBe("Left")
        if (result._tag === "Left") {
          const error = result.left
          expect(error._tag).toBe("PieceNotFound")
          if (error._tag === "PieceNotFound") {
            expect(error.id).toBe("missing" as PieceId)
          }
        }
      }).pipe(
        Effect.scoped,
        Effect.provide(
          makeRpcTestLayer(PieceRpcs, {
            getPieceNotes: {
              error: { _tag: "PieceNotFound", id: "missing" },
            },
          })
        )
      )
    )
  })

  describe("importPiece", () => {
    it.effect("encodes MusicXML payload and decodes ImportPieceResult", () =>
      Effect.gen(function* () {
        const client = yield* RpcClient.make(PieceRpcs)
        const result = yield* client.importPiece({
          id: "new-piece-id",
          xml: "<score-partwise>...</score-partwise>",
          filePath: "/uploads/new-song.musicxml",
        })

        expect(result.id).toBe("new-piece-id" as PieceId)
        expect(result.name).toBe("New Song")
        expect(result.totalMeasures).toBe(16 as MeasureNumber)
        expect(result.noteCount).toBe(128)
        expect(result.alreadyExists).toBe(false)
      }).pipe(
        Effect.scoped,
        Effect.provide(
          makeRpcTestLayer(PieceRpcs, {
            importPiece: {
              success: {
                id: "new-piece-id",
                name: "New Song",
                totalMeasures: 16,
                noteCount: 128,
                alreadyExists: false,
              },
            },
          })
        )
      )
    )

    it.effect("reports alreadyExists when piece was previously imported", () =>
      Effect.gen(function* () {
        const client = yield* RpcClient.make(PieceRpcs)
        const result = yield* client.importPiece({
          id: "existing-piece",
          xml: "<score-partwise>...</score-partwise>",
          filePath: "/uploads/existing.musicxml",
        })

        expect(result.alreadyExists).toBe(true)
      }).pipe(
        Effect.scoped,
        Effect.provide(
          makeRpcTestLayer(PieceRpcs, {
            importPiece: {
              success: {
                id: "existing-piece",
                name: "Existing Song",
                totalMeasures: 32,
                noteCount: 256,
                alreadyExists: true,
              },
            },
          })
        )
      )
    )

    it.effect("handles ParseError with MalformedXml reason", () =>
      Effect.gen(function* () {
        const client = yield* RpcClient.make(PieceRpcs)
        const result = yield* client
          .importPiece({
            id: "bad-piece",
            xml: "<invalid>not valid musicxml",
            filePath: "/uploads/bad.musicxml",
          })
          .pipe(Effect.either)

        expect(result._tag).toBe("Left")
        if (result._tag === "Left") {
          const error = result.left
          expect(error._tag).toBe("ParseError")
          if (error._tag === "ParseError") {
            expect(error.reason).toBe("MalformedXml")
            expect(error.details).toBe("Expected closing tag at line 5")
            expect(error.filePath).toBe("/uploads/bad.musicxml")
          }
        }
      }).pipe(
        Effect.scoped,
        Effect.provide(
          makeRpcTestLayer(PieceRpcs, {
            importPiece: {
              error: {
                _tag: "ParseError",
                reason: "MalformedXml",
                details: "Expected closing tag at line 5",
                filePath: "/uploads/bad.musicxml",
              },
            },
          })
        )
      )
    )

    it.effect("handles ParseError with NoPianoPart reason", () =>
      Effect.gen(function* () {
        const client = yield* RpcClient.make(PieceRpcs)
        const result = yield* client
          .importPiece({
            id: "guitar-piece",
            xml: "<score-partwise>guitar only</score-partwise>",
            filePath: "/uploads/guitar.musicxml",
          })
          .pipe(Effect.either)

        expect(result._tag).toBe("Left")
        if (result._tag === "Left") {
          const error = result.left
          expect(error._tag).toBe("ParseError")
          if (error._tag === "ParseError") {
            expect(error.reason).toBe("NoPianoPart")
          }
        }
      }).pipe(
        Effect.scoped,
        Effect.provide(
          makeRpcTestLayer(PieceRpcs, {
            importPiece: {
              error: {
                _tag: "ParseError",
                reason: "NoPianoPart",
                details: "No piano part found in score",
                filePath: "/uploads/guitar.musicxml",
              },
            },
          })
        )
      )
    )

    it.effect("handles ParseError with EmptyPiece reason", () =>
      Effect.gen(function* () {
        const client = yield* RpcClient.make(PieceRpcs)
        const result = yield* client
          .importPiece({
            id: "empty-piece",
            xml: "<score-partwise></score-partwise>",
            filePath: "/uploads/empty.musicxml",
          })
          .pipe(Effect.either)

        expect(result._tag).toBe("Left")
        if (result._tag === "Left") {
          const error = result.left
          expect(error._tag).toBe("ParseError")
          if (error._tag === "ParseError") {
            expect(error.reason).toBe("EmptyPiece")
          }
        }
      }).pipe(
        Effect.scoped,
        Effect.provide(
          makeRpcTestLayer(PieceRpcs, {
            importPiece: {
              error: {
                _tag: "ParseError",
                reason: "EmptyPiece",
                details: "Score contains no notes",
                filePath: "/uploads/empty.musicxml",
              },
            },
          })
        )
      )
    )

    it.effect("handles ParseError with UnsupportedFeature reason", () =>
      Effect.gen(function* () {
        const client = yield* RpcClient.make(PieceRpcs)
        const result = yield* client
          .importPiece({
            id: "complex-piece",
            xml: "<score-partwise>complex notation</score-partwise>",
            filePath: "/uploads/complex.musicxml",
          })
          .pipe(Effect.either)

        expect(result._tag).toBe("Left")
        if (result._tag === "Left") {
          const error = result.left
          expect(error._tag).toBe("ParseError")
          if (error._tag === "ParseError") {
            expect(error.reason).toBe("UnsupportedFeature")
            expect(error.details).toBe("Tuplets are not yet supported")
          }
        }
      }).pipe(
        Effect.scoped,
        Effect.provide(
          makeRpcTestLayer(PieceRpcs, {
            importPiece: {
              error: {
                _tag: "ParseError",
                reason: "UnsupportedFeature",
                details: "Tuplets are not yet supported",
                filePath: "/uploads/complex.musicxml",
              },
            },
          })
        )
      )
    )
  })

  describe("network error handling", () => {
    it.effect("handles network timeout", () =>
      Effect.gen(function* () {
        const client = yield* RpcClient.make(PieceRpcs)
        const result = yield* client.listPieces().pipe(Effect.exit)

        expect(result._tag).toBe("Failure")
      }).pipe(
        Effect.scoped,
        Effect.provide(makeRpcNetworkErrorLayer("timeout"))
      )
    )

    it.effect("handles server 500 error", () =>
      Effect.gen(function* () {
        const client = yield* RpcClient.make(PieceRpcs)
        const result = yield* client
          .getPiece({ id: "any" as PieceId })
          .pipe(Effect.exit)

        expect(result._tag).toBe("Failure")
      }).pipe(Effect.scoped, Effect.provide(makeRpcNetworkErrorLayer("500")))
    )

    it.effect("handles malformed JSON response", () =>
      Effect.gen(function* () {
        const client = yield* RpcClient.make(PieceRpcs)
        const result = yield* client.getAttempts({ pieceId: "any" as PieceId }).pipe(
          Effect.exit
        )

        expect(result._tag).toBe("Failure")
      }).pipe(
        Effect.scoped,
        Effect.provide(makeRpcNetworkErrorLayer("malformed"))
      )
    )
  })
})
