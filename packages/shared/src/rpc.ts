import { Rpc, RpcGroup } from "@effect/rpc"
import { Schema } from "effect"
import {
  Piece,
  Attempt,
  PieceId,
  MeasureNumber,
  Hand,
  NoteEvent,
  Milliseconds,
  Accuracy,
  AttemptId,
} from "./domain.js"
import { PieceNotFound, SessionError } from "./errors.js"

// Session started acknowledgment
export class SessionStarted extends Schema.Class<SessionStarted>(
  "SessionStarted"
)({
  sessionId: Schema.String,
  expectedNoteCount: Schema.Number,
  measureRange: Schema.Tuple(Schema.Number, Schema.Number),
}) {}

// Real-time feedback for each played note
export const NoteResultType = Schema.Literal("correct", "wrong", "extra")
export type NoteResultType = typeof NoteResultType.Type

export class NoteResult extends Schema.Class<NoteResult>("NoteResult")({
  pitch: Schema.Number,
  result: NoteResultType,
  timingOffset: Milliseconds, // ms from expected (negative = early)
}) {}

// Final session results
export class SessionComplete extends Schema.Class<SessionComplete>(
  "SessionComplete"
)({
  attemptId: AttemptId,
  noteAccuracy: Accuracy,
  timingAccuracy: Accuracy,
  combinedScore: Schema.Number,
  leftHandAccuracy: Schema.OptionFromNullOr(Accuracy),
  rightHandAccuracy: Schema.OptionFromNullOr(Accuracy),
  extraNotes: Schema.Number,
  missedNotes: Schema.Array(NoteEvent),
}) {}

// RPC groups
export class PieceRpcs extends RpcGroup.make(
  Rpc.make("listPieces", { success: Schema.Array(Piece) }),
  Rpc.make("getPiece", {
    payload: Schema.Struct({ id: PieceId }),
    success: Piece,
    error: PieceNotFound,
  }),
  Rpc.make("getAttempts", {
    payload: Schema.Struct({ pieceId: PieceId }),
    success: Schema.Array(Attempt),
  }),
  Rpc.make("getPieceNotes", {
    payload: Schema.Struct({ pieceId: PieceId }),
    success: Schema.Array(NoteEvent),
    error: PieceNotFound,
  })
) {}

export class SessionRpcs extends RpcGroup.make(
  Rpc.make("startSession", {
    payload: Schema.Struct({
      pieceId: PieceId,
      measureStart: MeasureNumber,
      measureEnd: MeasureNumber,
      hand: Hand,
      tempo: Schema.Number,
    }),
    success: SessionStarted,
    error: Schema.Union(SessionError, PieceNotFound),
  }),
  Rpc.make("submitNote", {
    payload: Schema.Struct({
      pitch: Schema.Number,
      velocity: Schema.Number,
      timestamp: Schema.Number,
      on: Schema.Boolean,
    }),
    success: NoteResult,
    error: SessionError,
  }),
  Rpc.make("endSession", {
    success: SessionComplete,
    error: SessionError,
  })
) {}
