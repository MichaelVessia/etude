import { Schema } from "effect"
import { PieceId } from "./domain.js"

export class ParseError extends Schema.TaggedError<ParseError>()("ParseError", {
  reason: Schema.Literal(
    "MalformedXml",
    "UnsupportedFeature",
    "NoPianoPart",
    "EmptyPiece"
  ),
  details: Schema.String,
  filePath: Schema.String,
}) {}

export class SessionError extends Schema.TaggedError<SessionError>()(
  "SessionError",
  {
    reason: Schema.Literal("NotStarted", "AlreadyActive", "InvalidState"),
  }
) {}

export class PieceNotFound extends Schema.TaggedError<PieceNotFound>()(
  "PieceNotFound",
  { id: PieceId }
) {}
