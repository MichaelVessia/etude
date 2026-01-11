import { describe, expect, it } from "@codeforbreakfast/bun-test-effect"
import { Effect, Option } from "effect"
import { RpcClient } from "@effect/rpc"
import {
  SessionRpcs,
  PieceId,
  MeasureNumber,
  Milliseconds,
  AttemptId,
  Accuracy,
  MidiPitch,
} from "@etude/shared"
import { makeRpcTestLayer } from "./test-utils.js"

describe("SessionRpcClient", () => {
  describe("startSession", () => {
    it.effect("encodes payload and decodes SessionStarted response", () =>
      Effect.gen(function* () {
        const client = yield* RpcClient.make(SessionRpcs)
        const result = yield* client.startSession({
          pieceId: "piece-123" as PieceId,
          measureStart: 1 as MeasureNumber,
          measureEnd: 8 as MeasureNumber,
          hand: "both",
          tempo: 120,
        })

        expect(result.sessionId).toBe("session-abc123")
        expect(result.expectedNoteCount).toBe(42)
        expect(result.measureRange).toEqual([1, 8])
      }).pipe(
        Effect.scoped,
        Effect.provide(
          makeRpcTestLayer(SessionRpcs, {
            startSession: {
              success: {
                sessionId: "session-abc123",
                expectedNoteCount: 42,
                measureRange: [1, 8],
              },
            },
          })
        )
      )
    )

    it.effect("handles SessionError with reason AlreadyActive", () =>
      Effect.gen(function* () {
        const client = yield* RpcClient.make(SessionRpcs)
        const result = yield* client
          .startSession({
            pieceId: "piece-123" as PieceId,
            measureStart: 1 as MeasureNumber,
            measureEnd: 8 as MeasureNumber,
            hand: "both",
            tempo: 120,
          })
          .pipe(Effect.either)

        expect(result._tag).toBe("Left")
        if (result._tag === "Left") {
          const error = result.left
          expect(error._tag).toBe("SessionError")
          if (error._tag === "SessionError") {
            expect(error.reason).toBe("AlreadyActive")
          }
        }
      }).pipe(
        Effect.scoped,
        Effect.provide(
          makeRpcTestLayer(SessionRpcs, {
            startSession: {
              error: { _tag: "SessionError", reason: "AlreadyActive" },
            },
          })
        )
      )
    )

    it.effect("handles PieceNotFound error", () =>
      Effect.gen(function* () {
        const client = yield* RpcClient.make(SessionRpcs)
        const result = yield* client
          .startSession({
            pieceId: "nonexistent" as PieceId,
            measureStart: 1 as MeasureNumber,
            measureEnd: 8 as MeasureNumber,
            hand: "both",
            tempo: 120,
          })
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
          makeRpcTestLayer(SessionRpcs, {
            startSession: {
              error: { _tag: "PieceNotFound", id: "nonexistent" },
            },
          })
        )
      )
    )
  })

  describe("submitNote", () => {
    it.effect("encodes note data and decodes NoteResult response", () =>
      Effect.gen(function* () {
        const client = yield* RpcClient.make(SessionRpcs)
        const result = yield* client.submitNote({
          pitch: 60,
          velocity: 80,
          timestamp: 1000,
          on: true,
        })

        expect(result.pitch).toBe(60)
        expect(result.result).toBe("correct")
        expect(result.timingOffset).toBe(-15 as Milliseconds)
      }).pipe(
        Effect.scoped,
        Effect.provide(
          makeRpcTestLayer(SessionRpcs, {
            submitNote: {
              success: {
                pitch: 60,
                result: "correct",
                timingOffset: -15,
              },
            },
          })
        )
      )
    )

    it.effect("handles NoteResult with result wrong", () =>
      Effect.gen(function* () {
        const client = yield* RpcClient.make(SessionRpcs)
        const result = yield* client.submitNote({
          pitch: 62,
          velocity: 90,
          timestamp: 1500,
          on: true,
        })

        expect(result.pitch).toBe(62)
        expect(result.result).toBe("wrong")
        expect(result.timingOffset).toBe(25 as Milliseconds)
      }).pipe(
        Effect.scoped,
        Effect.provide(
          makeRpcTestLayer(SessionRpcs, {
            submitNote: {
              success: {
                pitch: 62,
                result: "wrong",
                timingOffset: 25,
              },
            },
          })
        )
      )
    )

    it.effect("handles NoteResult with result extra", () =>
      Effect.gen(function* () {
        const client = yield* RpcClient.make(SessionRpcs)
        const result = yield* client.submitNote({
          pitch: 64,
          velocity: 70,
          timestamp: 2000,
          on: true,
        })

        expect(result.pitch).toBe(64)
        expect(result.result).toBe("extra")
      }).pipe(
        Effect.scoped,
        Effect.provide(
          makeRpcTestLayer(SessionRpcs, {
            submitNote: {
              success: {
                pitch: 64,
                result: "extra",
                timingOffset: 0,
              },
            },
          })
        )
      )
    )

    it.effect("handles SessionError with reason NotStarted", () =>
      Effect.gen(function* () {
        const client = yield* RpcClient.make(SessionRpcs)
        const result = yield* client
          .submitNote({
            pitch: 60,
            velocity: 80,
            timestamp: 1000,
            on: true,
          })
          .pipe(Effect.either)

        expect(result._tag).toBe("Left")
        if (result._tag === "Left") {
          const error = result.left
          expect(error._tag).toBe("SessionError")
          if (error._tag === "SessionError") {
            expect(error.reason).toBe("NotStarted")
          }
        }
      }).pipe(
        Effect.scoped,
        Effect.provide(
          makeRpcTestLayer(SessionRpcs, {
            submitNote: {
              error: { _tag: "SessionError", reason: "NotStarted" },
            },
          })
        )
      )
    )
  })

  describe("endSession", () => {
    it.effect("decodes SessionComplete response with all fields", () =>
      Effect.gen(function* () {
        const client = yield* RpcClient.make(SessionRpcs)
        const result = yield* client.endSession()

        expect(result.attemptId).toBe("attempt-xyz" as AttemptId)
        expect(result.noteAccuracy).toBe(0.95 as Accuracy)
        expect(result.timingAccuracy).toBe(0.88 as Accuracy)
        expect(result.combinedScore).toBe(91.5)
        expect(Option.isSome(result.leftHandAccuracy)).toBe(true)
        if (Option.isSome(result.leftHandAccuracy)) {
          expect(result.leftHandAccuracy.value).toBe(0.92 as Accuracy)
        }
        expect(Option.isSome(result.rightHandAccuracy)).toBe(true)
        if (Option.isSome(result.rightHandAccuracy)) {
          expect(result.rightHandAccuracy.value).toBe(0.98 as Accuracy)
        }
        expect(result.extraNotes).toBe(2)
        expect(result.missedNotes).toHaveLength(1)
        expect(result.missedNotes[0].pitch).toBe(60 as MidiPitch)
      }).pipe(
        Effect.scoped,
        Effect.provide(
          makeRpcTestLayer(SessionRpcs, {
            endSession: {
              success: {
                attemptId: "attempt-xyz",
                noteAccuracy: 0.95,
                timingAccuracy: 0.88,
                combinedScore: 91.5,
                leftHandAccuracy: 0.92,
                rightHandAccuracy: 0.98,
                extraNotes: 2,
                missedNotes: [
                  {
                    pitch: 60,
                    startTime: 1000,
                    duration: 500,
                    measure: 3,
                    hand: "left",
                    voice: null,
                  },
                ],
              },
            },
          })
        )
      )
    )

    it.effect("handles optional hand accuracy as None when null", () =>
      Effect.gen(function* () {
        const client = yield* RpcClient.make(SessionRpcs)
        const result = yield* client.endSession()

        expect(Option.isNone(result.leftHandAccuracy)).toBe(true)
        expect(Option.isNone(result.rightHandAccuracy)).toBe(true)
      }).pipe(
        Effect.scoped,
        Effect.provide(
          makeRpcTestLayer(SessionRpcs, {
            endSession: {
              success: {
                attemptId: "attempt-abc",
                noteAccuracy: 0.9,
                timingAccuracy: 0.85,
                combinedScore: 87.5,
                leftHandAccuracy: null,
                rightHandAccuracy: null,
                extraNotes: 0,
                missedNotes: [],
              },
            },
          })
        )
      )
    )

    it.effect("handles SessionError with reason NotStarted", () =>
      Effect.gen(function* () {
        const client = yield* RpcClient.make(SessionRpcs)
        const result = yield* client.endSession().pipe(Effect.either)

        expect(result._tag).toBe("Left")
        if (result._tag === "Left") {
          const error = result.left
          expect(error._tag).toBe("SessionError")
          if (error._tag === "SessionError") {
            expect(error.reason).toBe("NotStarted")
          }
        }
      }).pipe(
        Effect.scoped,
        Effect.provide(
          makeRpcTestLayer(SessionRpcs, {
            endSession: {
              error: { _tag: "SessionError", reason: "NotStarted" },
            },
          })
        )
      )
    )
  })
})
