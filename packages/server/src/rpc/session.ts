import { Effect, Option } from "effect"
import {
  SessionRpcs,
  SessionStarted,
  SessionComplete,
  NoteResult,
  Accuracy,
  Milliseconds,
  SessionError,
} from "@etude/shared"
import { SessionService } from "../services/session.js"

/**
 * RPC handlers for session management.
 * Implements SessionRpcs from @etude/shared.
 * Requires SessionService in context.
 */
export const SessionRpcsLive = SessionRpcs.toLayer(
  Effect.gen(function* () {
    const session = yield* SessionService

    return {
      startSession: ({ pieceId, measureStart, measureEnd, hand, tempo }) =>
        session.startSession(
          pieceId,
          measureStart,
          measureEnd,
          hand,
          tempo
        ).pipe(
          Effect.map((result) =>
            new SessionStarted({
              sessionId: result.sessionId,
              expectedNoteCount: result.expectedNoteCount,
              measureRange: result.measureRange,
            })
          ),
          // Convert SqlError to SessionError for client-friendly error handling
          Effect.catchTag("SqlError", (err) => {
            console.error("Database error in startSession:", err)
            return new SessionError({ reason: "InvalidState" })
          })
        ),

      endSession: () =>
        session.endSession().pipe(
          Effect.map((result) =>
            new SessionComplete({
              attemptId: result.attemptId,
              noteAccuracy: result.noteAccuracy as Accuracy,
              timingAccuracy: result.timingAccuracy as Accuracy,
              combinedScore: result.combinedScore,
              leftHandAccuracy: Option.fromNullable(
                result.leftHandAccuracy as Accuracy | null
              ),
              rightHandAccuracy: Option.fromNullable(
                result.rightHandAccuracy as Accuracy | null
              ),
              extraNotes: result.extraNotes,
              missedNotes: result.missedNotes,
            })
          ),
          Effect.catchTag("SqlError", (err) => {
            console.error("Database error in endSession:", err)
            return new SessionError({ reason: "InvalidState" })
          })
        ),

      // Note: submitNote is included for completeness but will be migrated
      // to WebSocket streaming in Phase 3
      submitNote: ({ pitch, velocity, timestamp, on }) =>
        session.submitNote(pitch, velocity, timestamp, on).pipe(
          Effect.map((result) =>
            new NoteResult({
              pitch: result.pitch,
              result: result.result,
              timingOffset: result.timingOffset as Milliseconds,
            })
          )
        ),
    }
  })
)
