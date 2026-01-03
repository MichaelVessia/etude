import { Schema } from "effect"

// ============================================================================
// Client → Server Messages
// ============================================================================

export class WsNoteMessage extends Schema.Class<WsNoteMessage>("WsNoteMessage")({
  type: Schema.Literal("note"),
  pitch: Schema.Number,
  velocity: Schema.Number,
  timestamp: Schema.Number,
  on: Schema.Boolean,
}) {}

export class WsPongMessage extends Schema.Class<WsPongMessage>("WsPongMessage")({
  type: Schema.Literal("pong"),
}) {}

export const WsClientMessage = Schema.Union(WsNoteMessage, WsPongMessage)
export type WsClientMessage = typeof WsClientMessage.Type

// ============================================================================
// Server → Client Messages
// ============================================================================

export class WsReadyMessage extends Schema.Class<WsReadyMessage>("WsReadyMessage")({
  type: Schema.Literal("ready"),
  sessionId: Schema.String,
}) {}

export class WsResultMessage extends Schema.Class<WsResultMessage>("WsResultMessage")({
  type: Schema.Literal("result"),
  pitch: Schema.Number,
  result: Schema.Literal("correct", "early", "late", "extra", "wrong"),
  timingOffset: Schema.Number,
  expectedNoteTime: Schema.NullOr(Schema.Number),
}) {}

export class WsErrorMessage extends Schema.Class<WsErrorMessage>("WsErrorMessage")({
  type: Schema.Literal("error"),
  message: Schema.String,
  recoverable: Schema.Literal(true),
}) {}

export class WsPingMessage extends Schema.Class<WsPingMessage>("WsPingMessage")({
  type: Schema.Literal("ping"),
}) {}

export class WsSessionEndMessage extends Schema.Class<WsSessionEndMessage>("WsSessionEndMessage")({
  type: Schema.Literal("sessionEnd"),
  score: Schema.Struct({
    correct: Schema.Number,
    early: Schema.Number,
    late: Schema.Number,
    extra: Schema.Number,
    missed: Schema.Number,
    accuracy: Schema.Number,
  }),
}) {}

export const WsServerMessage = Schema.Union(
  WsReadyMessage,
  WsResultMessage,
  WsErrorMessage,
  WsPingMessage,
  WsSessionEndMessage
)
export type WsServerMessage = typeof WsServerMessage.Type
