import { Schema } from "effect"

// IDs
export const PieceId = Schema.String.pipe(Schema.brand("PieceId"))
export type PieceId = typeof PieceId.Type

export const AttemptId = Schema.String.pipe(Schema.brand("AttemptId"))
export type AttemptId = typeof AttemptId.Type

// Music primitives
export const MidiPitch = Schema.Number.pipe(Schema.brand("MidiPitch")) // 0-127
export type MidiPitch = typeof MidiPitch.Type

export const MeasureNumber = Schema.Number.pipe(Schema.brand("MeasureNumber"))
export type MeasureNumber = typeof MeasureNumber.Type

export const Milliseconds = Schema.Number.pipe(Schema.brand("Milliseconds"))
export type Milliseconds = typeof Milliseconds.Type

export const Velocity = Schema.Number.pipe(Schema.brand("Velocity")) // 0-127
export type Velocity = typeof Velocity.Type

export const TempoPercent = Schema.Number.pipe(Schema.brand("TempoPercent")) // e.g., 100 = original
export type TempoPercent = typeof TempoPercent.Type

export const Accuracy = Schema.Number.pipe(Schema.brand("Accuracy")) // 0-1
export type Accuracy = typeof Accuracy.Type

export const Hand = Schema.Literal("left", "right", "both")
export type Hand = typeof Hand.Type

export const Difficulty = Schema.Literal("beginner", "intermediate", "advanced")
export type Difficulty = typeof Difficulty.Type

// Piece
export class Piece extends Schema.Class<Piece>("Piece")({
  id: PieceId,
  name: Schema.String,
  composer: Schema.OptionFromNullOr(Schema.String),
  filePath: Schema.String,
  totalMeasures: MeasureNumber,
  difficulty: Schema.OptionFromNullOr(Difficulty),
  addedAt: Schema.Date,
}) {}

// NoteEvent - represents a note in the score
export class NoteEvent extends Schema.Class<NoteEvent>("NoteEvent")({
  pitch: MidiPitch,
  startTime: Milliseconds, // from piece start
  duration: Milliseconds,
  measure: MeasureNumber,
  hand: Schema.Literal("left", "right"),
  voice: Schema.OptionFromNullOr(Schema.Number),
}) {}

// PlayedNote - captures MIDI input from user
export class PlayedNote extends Schema.Class<PlayedNote>("PlayedNote")({
  pitch: MidiPitch,
  timestamp: Milliseconds, // from assessment start
  velocity: Velocity,
  duration: Schema.OptionFromNullOr(Milliseconds), // filled on note-off
}) {}

// Attempt - a practice session result
export class Attempt extends Schema.Class<Attempt>("Attempt")({
  id: AttemptId,
  pieceId: PieceId,
  timestamp: Schema.Date,
  measureStart: MeasureNumber,
  measureEnd: MeasureNumber,
  hand: Hand,
  tempo: TempoPercent,
  noteAccuracy: Accuracy,
  timingAccuracy: Accuracy,
  combinedScore: Schema.Number, // 0-100
}) {}
