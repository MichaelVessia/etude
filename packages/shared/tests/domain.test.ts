import { describe, expect, it } from "@codeforbreakfast/bun-test-effect"
import { Schema, Option } from "effect"
import {
  PieceId,
  AttemptId,
  MidiPitch,
  MeasureNumber,
  Milliseconds,
  Velocity,
  TempoPercent,
  Accuracy,
  Hand,
  Difficulty,
  Piece,
  NoteEvent,
  PlayedNote,
  Attempt,
} from "../src/domain.js"

describe("domain types", () => {
  describe("branded types", () => {
    it("PieceId encodes and decodes", () => {
      const id = "abc-123"
      const encoded = Schema.encodeSync(PieceId)(id as PieceId)
      const decoded = Schema.decodeSync(PieceId)(encoded)
      expect(decoded).toBe(id)
    })

    it("MidiPitch encodes and decodes", () => {
      const pitch = 60 // Middle C
      const encoded = Schema.encodeSync(MidiPitch)(pitch as MidiPitch)
      const decoded = Schema.decodeSync(MidiPitch)(encoded)
      expect(decoded).toBe(pitch)
    })

    it("Hand accepts valid values", () => {
      expect(Schema.decodeSync(Hand)("left")).toBe("left")
      expect(Schema.decodeSync(Hand)("right")).toBe("right")
      expect(Schema.decodeSync(Hand)("both")).toBe("both")
    })

    it("Difficulty accepts valid values", () => {
      expect(Schema.decodeSync(Difficulty)("beginner")).toBe("beginner")
      expect(Schema.decodeSync(Difficulty)("intermediate")).toBe("intermediate")
      expect(Schema.decodeSync(Difficulty)("advanced")).toBe("advanced")
    })
  })

  describe("Piece schema", () => {
    it("creates a piece with all fields", () => {
      const piece = new Piece({
        id: "piece-1" as PieceId,
        name: "Test Piece",
        composer: Option.some("Bach"),
        filePath: "/pieces/test.xml",
        totalMeasures: 32 as MeasureNumber,
        difficulty: Option.some("beginner" as const),
        addedAt: new Date("2024-01-01"),
      })

      expect(piece.id).toBe("piece-1")
      expect(piece.name).toBe("Test Piece")
      expect(Option.getOrNull(piece.composer)).toBe("Bach")
      expect(piece.totalMeasures).toBe(32)
    })

    it("handles null optional fields", () => {
      const piece = new Piece({
        id: "piece-2" as PieceId,
        name: "Test Piece 2",
        composer: Option.none(),
        filePath: "/pieces/test2.xml",
        totalMeasures: 16 as MeasureNumber,
        difficulty: Option.none(),
        addedAt: new Date(),
      })

      expect(Option.isNone(piece.composer)).toBe(true)
      expect(Option.isNone(piece.difficulty)).toBe(true)
    })
  })

  describe("NoteEvent schema", () => {
    it("creates a note event", () => {
      const note = new NoteEvent({
        pitch: 60 as MidiPitch,
        startTime: 1000 as Milliseconds,
        duration: 500 as Milliseconds,
        measure: 1 as MeasureNumber,
        hand: "right",
        voice: Option.some(1),
      })

      expect(note.pitch).toBe(60)
      expect(note.startTime).toBe(1000)
      expect(note.hand).toBe("right")
    })
  })

  describe("PlayedNote schema", () => {
    it("creates a played note", () => {
      const played = new PlayedNote({
        pitch: 60 as MidiPitch,
        timestamp: 1050 as Milliseconds,
        velocity: 80 as Velocity,
        duration: Option.some(450 as Milliseconds),
      })

      expect(played.pitch).toBe(60)
      expect(played.velocity).toBe(80)
      expect(Option.getOrNull(played.duration)).toBe(450)
    })
  })

  describe("Attempt schema", () => {
    it("creates an attempt", () => {
      const attempt = new Attempt({
        id: "attempt-1" as AttemptId,
        pieceId: "piece-1" as PieceId,
        timestamp: new Date("2024-01-15"),
        measureStart: 1 as MeasureNumber,
        measureEnd: 16 as MeasureNumber,
        hand: "both",
        tempo: 100 as TempoPercent,
        noteAccuracy: 0.94 as Accuracy,
        timingAccuracy: 0.87 as Accuracy,
        combinedScore: 91,
      })

      expect(attempt.noteAccuracy).toBe(0.94)
      expect(attempt.combinedScore).toBe(91)
    })
  })
})
