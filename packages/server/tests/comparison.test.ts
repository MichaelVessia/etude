import { describe, expect, it } from "@codeforbreakfast/bun-test-effect"
import { Effect, Option } from "effect"
import {
  ComparisonService,
  ComparisonServiceLive,
} from "../src/services/comparison.js"
import {
  NoteEvent,
  PlayedNote,
  MidiPitch,
  Milliseconds,
  MeasureNumber,
  Velocity,
} from "@etude/shared"

// Helper to create NoteEvent
const note = (
  pitch: number,
  startTime: number,
  hand: "left" | "right" = "right"
): NoteEvent =>
  new NoteEvent({
    pitch: pitch as MidiPitch,
    startTime: startTime as Milliseconds,
    duration: 500 as Milliseconds,
    measure: 1 as MeasureNumber,
    hand,
    voice: Option.none(),
  })

// Helper to create PlayedNote
const played = (pitch: number, timestamp: number): PlayedNote =>
  new PlayedNote({
    pitch: pitch as MidiPitch,
    timestamp: timestamp as Milliseconds,
    velocity: 80 as Velocity,
    duration: Option.none(),
  })

describe("ComparisonService", () => {
  describe("compare", () => {
    it.effect("scores perfect performance", () =>
      Effect.gen(function* () {
        const service = yield* ComparisonService

        const expected = [note(60, 0), note(62, 500), note(64, 1000)]

        const playedNotes = [played(60, 0), played(62, 500), played(64, 1000)]

        const result = yield* service.compare(expected, playedNotes, "both")

        expect(result.noteAccuracy).toBe(1)
        expect(result.timingAccuracy).toBe(1)
        expect(result.combinedScore).toBe(100)
        expect(result.missedNotes.length).toBe(0)
        expect(result.extraNotes).toBe(0)
      }).pipe(Effect.provide(ComparisonServiceLive))
    )

    it.effect("handles missed notes", () =>
      Effect.gen(function* () {
        const service = yield* ComparisonService

        const expected = [note(60, 0), note(62, 500), note(64, 1000)]

        // Only play first two notes
        const playedNotes = [played(60, 0), played(62, 500)]

        const result = yield* service.compare(expected, playedNotes, "both")

        expect(result.noteAccuracy).toBeCloseTo(2 / 3, 2)
        expect(result.missedNotes.length).toBe(1)
        expect(result.missedNotes[0]!.pitch).toBe(64)
      }).pipe(Effect.provide(ComparisonServiceLive))
    )

    it.effect("handles wrong notes", () =>
      Effect.gen(function* () {
        const service = yield* ComparisonService

        const expected = [note(60, 0), note(62, 500)]

        // Play wrong pitch for second note
        const playedNotes = [played(60, 0), played(63, 500)]

        const result = yield* service.compare(expected, playedNotes, "both")

        expect(result.noteAccuracy).toBeCloseTo(0.5, 2) // 1 correct out of 2
        const wrongResults = result.matchResults.filter(
          (r) => r.result === "wrong"
        )
        expect(wrongResults.length).toBe(1)
      }).pipe(Effect.provide(ComparisonServiceLive))
    )

    it.effect("handles extra notes", () =>
      Effect.gen(function* () {
        const service = yield* ComparisonService

        const expected = [note(60, 0)]

        // Play expected note plus an extra
        const playedNotes = [played(60, 0), played(65, 200)]

        const result = yield* service.compare(expected, playedNotes, "both")

        expect(result.noteAccuracy).toBe(1) // Extra notes don't affect accuracy
        expect(result.extraNotes).toBe(1)
      }).pipe(Effect.provide(ComparisonServiceLive))
    )

    it.effect("scores timing within grace period as perfect", () =>
      Effect.gen(function* () {
        const service = yield* ComparisonService

        const expected = [note(60, 1000)]

        // Play 50ms early (within 75ms grace period)
        const playedNotes = [played(60, 950)]

        const result = yield* service.compare(expected, playedNotes, "both")

        expect(result.noteAccuracy).toBe(1)
        expect(result.timingAccuracy).toBe(1) // Perfect timing
      }).pipe(Effect.provide(ComparisonServiceLive))
    )

    it.effect("reduces timing score outside grace period", () =>
      Effect.gen(function* () {
        const service = yield* ComparisonService

        const expected = [note(60, 1000)]

        // Play 100ms early (outside 75ms grace, within 150ms tolerance)
        const playedNotes = [played(60, 900)]

        const result = yield* service.compare(expected, playedNotes, "both")

        expect(result.noteAccuracy).toBe(1)
        expect(result.timingAccuracy).toBeLessThan(1)
        expect(result.timingAccuracy).toBeGreaterThan(0.5)
      }).pipe(Effect.provide(ComparisonServiceLive))
    )

    it.effect("filters by hand when not practicing both", () =>
      Effect.gen(function* () {
        const service = yield* ComparisonService

        const expected = [
          note(60, 0, "right"),
          note(48, 0, "left"),
          note(62, 500, "right"),
          note(50, 500, "left"),
        ]

        // Only play right hand notes
        const playedNotes = [played(60, 0), played(62, 500)]

        const result = yield* service.compare(expected, playedNotes, "right")

        // Should only compare against right hand notes
        expect(result.noteAccuracy).toBe(1) // 2 correct out of 2 right hand notes
        expect(result.missedNotes.length).toBe(0)
      }).pipe(Effect.provide(ComparisonServiceLive))
    )

    it.effect("calculates per-hand accuracy when practicing both", () =>
      Effect.gen(function* () {
        const service = yield* ComparisonService

        const expected = [
          note(60, 0, "right"),
          note(48, 0, "left"),
          note(62, 500, "right"),
          note(50, 500, "left"),
        ]

        // Play all right hand but only one left hand
        const playedNotes = [
          played(60, 0),
          played(48, 0),
          played(62, 500),
          // Missing left hand at 500
        ]

        const result = yield* service.compare(expected, playedNotes, "both")

        expect(result.rightHandAccuracy).toBe(1) // 2/2 right hand correct
        expect(result.leftHandAccuracy).toBe(0.5) // 1/2 left hand correct
      }).pipe(Effect.provide(ComparisonServiceLive))
    )

    it.effect("uses greedy matching for repeated pitches", () =>
      Effect.gen(function* () {
        const service = yield* ComparisonService

        // Three C4s expected at different times
        const expected = [note(60, 0), note(60, 500), note(60, 1000)]

        // Play three C4s at roughly the right times
        const playedNotes = [
          played(60, 50), // Should match first
          played(60, 480), // Should match second
          played(60, 1020), // Should match third
        ]

        const result = yield* service.compare(expected, playedNotes, "both")

        expect(result.noteAccuracy).toBe(1)
        expect(result.missedNotes.length).toBe(0)
      }).pipe(Effect.provide(ComparisonServiceLive))
    )

    it.effect("calculates combined score with default weights", () =>
      Effect.gen(function* () {
        const service = yield* ComparisonService

        const expected = [note(60, 0), note(62, 500)]

        // Perfect notes, slight timing offset
        const playedNotes = [
          played(60, 50), // 50ms late
          played(62, 550), // 50ms late
        ]

        const result = yield* service.compare(expected, playedNotes, "both")

        // Note accuracy = 1.0 (100%)
        // Timing accuracy = 1.0 (within grace period)
        // Combined = 0.6 * 1.0 + 0.4 * 1.0 = 1.0 = 100%
        expect(result.noteAccuracy).toBe(1)
        expect(result.combinedScore).toBe(100)
      }).pipe(Effect.provide(ComparisonServiceLive))
    )
  })

  describe("matchNote", () => {
    it.effect("matches correct pitch", () =>
      Effect.gen(function* () {
        const service = yield* ComparisonService

        const expected = [note(60, 0), note(62, 500)]
        const matchedIndices = new Set<number>()

        const result = yield* service.matchNote(
          played(60, 50),
          expected,
          matchedIndices,
          "both"
        )

        expect(result.result).toBe("correct")
        expect(result.expectedNote?.pitch).toBe(60)
        expect(result.timingOffset).toBe(50)
      }).pipe(Effect.provide(ComparisonServiceLive))
    )

    it.effect("identifies wrong pitch as wrong", () =>
      Effect.gen(function* () {
        const service = yield* ComparisonService

        const expected = [note(60, 0)]
        const matchedIndices = new Set<number>()

        const result = yield* service.matchNote(
          played(63, 50),
          expected,
          matchedIndices,
          "both"
        )

        expect(result.result).toBe("wrong")
      }).pipe(Effect.provide(ComparisonServiceLive))
    )

    it.effect("identifies extra note when no expected notes", () =>
      Effect.gen(function* () {
        const service = yield* ComparisonService

        const matchedIndices = new Set<number>()

        const result = yield* service.matchNote(
          played(60, 0),
          [],
          matchedIndices,
          "both"
        )

        expect(result.result).toBe("extra")
        expect(result.expectedNote).toBeNull()
      }).pipe(Effect.provide(ComparisonServiceLive))
    )

    it.effect("does not double-match notes", () =>
      Effect.gen(function* () {
        const service = yield* ComparisonService

        const expected = [note(60, 0)]
        const matchedIndices = new Set<number>()

        // Match first note
        yield* service.matchNote(played(60, 0), expected, matchedIndices, "both")

        // Try to match same pitch again - should be extra
        const result = yield* service.matchNote(
          played(60, 100),
          expected,
          matchedIndices,
          "both"
        )

        expect(result.result).toBe("extra")
      }).pipe(Effect.provide(ComparisonServiceLive))
    )

    it.effect("marks note at 149ms offset as correct (within 150ms tolerance)", () =>
      Effect.gen(function* () {
        const service = yield* ComparisonService

        const expected = [note(60, 1000)]
        const matchedIndices = new Set<number>()

        // Play 149ms late (just within 150ms tolerance)
        const result = yield* service.matchNote(
          played(60, 1149),
          expected,
          matchedIndices,
          "both"
        )

        expect(result.result).toBe("correct")
        expect(result.timingOffset).toBe(149)
      }).pipe(Effect.provide(ComparisonServiceLive))
    )

    it.effect("marks note at 150ms offset as correct (exactly at tolerance)", () =>
      Effect.gen(function* () {
        const service = yield* ComparisonService

        const expected = [note(60, 1000)]
        const matchedIndices = new Set<number>()

        // Play exactly 150ms late (at tolerance boundary)
        const result = yield* service.matchNote(
          played(60, 1150),
          expected,
          matchedIndices,
          "both"
        )

        expect(result.result).toBe("correct")
        expect(result.timingOffset).toBe(150)
      }).pipe(Effect.provide(ComparisonServiceLive))
    )

    it.effect("marks note at 151ms offset as wrong (outside 150ms tolerance)", () =>
      Effect.gen(function* () {
        const service = yield* ComparisonService

        const expected = [note(60, 1000)]
        const matchedIndices = new Set<number>()

        // Play 151ms late (just outside 150ms tolerance)
        const result = yield* service.matchNote(
          played(60, 1151),
          expected,
          matchedIndices,
          "both"
        )

        expect(result.result).toBe("wrong")
        expect(result.timingOffset).toBe(151)
      }).pipe(Effect.provide(ComparisonServiceLive))
    )

    it.effect("marks early note at -149ms offset as correct", () =>
      Effect.gen(function* () {
        const service = yield* ComparisonService

        const expected = [note(60, 1000)]
        const matchedIndices = new Set<number>()

        // Play 149ms early (within tolerance)
        const result = yield* service.matchNote(
          played(60, 851),
          expected,
          matchedIndices,
          "both"
        )

        expect(result.result).toBe("correct")
        expect(result.timingOffset).toBe(-149)
      }).pipe(Effect.provide(ComparisonServiceLive))
    )

    it.effect("marks early note at -151ms offset as wrong", () =>
      Effect.gen(function* () {
        const service = yield* ComparisonService

        const expected = [note(60, 1000)]
        const matchedIndices = new Set<number>()

        // Play 151ms early (outside tolerance)
        const result = yield* service.matchNote(
          played(60, 849),
          expected,
          matchedIndices,
          "both"
        )

        expect(result.result).toBe("wrong")
        expect(result.timingOffset).toBe(-151)
      }).pipe(Effect.provide(ComparisonServiceLive))
    )
  })

  describe("chord handling", () => {
    it.effect("scores all notes correct when chord played in order", () =>
      Effect.gen(function* () {
        const service = yield* ComparisonService

        // C major chord (C, E, G)
        const expected = [
          note(60, 0), // C4
          note(64, 0), // E4
          note(67, 0), // G4
        ]

        // Play in order: C, E, G with small timing offsets
        const playedNotes = [
          played(60, 10),
          played(64, 15),
          played(67, 20),
        ]

        const result = yield* service.compare(expected, playedNotes, "both")

        expect(result.noteAccuracy).toBe(1)
        expect(result.missedNotes.length).toBe(0)
        // All 3 notes should be correct
        const correctCount = result.matchResults.filter(
          (r) => r.result === "correct"
        ).length
        expect(correctCount).toBe(3)
      }).pipe(Effect.provide(ComparisonServiceLive))
    )

    it.effect("scores all notes correct when chord played out of order", () =>
      Effect.gen(function* () {
        const service = yield* ComparisonService

        // C major chord
        const expected = [
          note(60, 0), // C4
          note(64, 0), // E4
          note(67, 0), // G4
        ]

        // Play out of order: E, C, G
        const playedNotes = [
          played(64, 10), // E first
          played(60, 15), // C second
          played(67, 20), // G third
        ]

        const result = yield* service.compare(expected, playedNotes, "both")

        expect(result.noteAccuracy).toBe(1)
        expect(result.missedNotes.length).toBe(0)
        const correctCount = result.matchResults.filter(
          (r) => r.result === "correct"
        ).length
        expect(correctCount).toBe(3)
      }).pipe(Effect.provide(ComparisonServiceLive))
    )

    it.effect("marks only the missed note as wrong in partial chord", () =>
      Effect.gen(function* () {
        const service = yield* ComparisonService

        // C major chord
        const expected = [
          note(60, 0), // C4
          note(64, 0), // E4
          note(67, 0), // G4
        ]

        // Play only C and G (miss E)
        const playedNotes = [
          played(60, 10),
          played(67, 20),
        ]

        const result = yield* service.compare(expected, playedNotes, "both")

        expect(result.noteAccuracy).toBeCloseTo(2 / 3, 2) // 2 out of 3
        expect(result.missedNotes.length).toBe(1)
        expect(result.missedNotes[0]!.pitch).toBe(64) // E was missed
        const correctCount = result.matchResults.filter(
          (r) => r.result === "correct"
        ).length
        expect(correctCount).toBe(2)
      }).pipe(Effect.provide(ComparisonServiceLive))
    )

    it.effect("handles chord with one wrong note", () =>
      Effect.gen(function* () {
        const service = yield* ComparisonService

        // C major chord
        const expected = [
          note(60, 0), // C4
          note(64, 0), // E4
          note(67, 0), // G4
        ]

        // Play C, F (wrong), G
        const playedNotes = [
          played(60, 10),
          played(65, 15), // F instead of E
          played(67, 20),
        ]

        const result = yield* service.compare(expected, playedNotes, "both")

        // C and G correct, F is wrong (doesn't match any expected)
        // E (64) is missed since we played F (65) instead
        expect(result.missedNotes.length).toBe(1)
        expect(result.missedNotes[0]!.pitch).toBe(64)
        const correctCount = result.matchResults.filter(
          (r) => r.result === "correct"
        ).length
        expect(correctCount).toBe(2)
        const wrongCount = result.matchResults.filter(
          (r) => r.result === "wrong"
        ).length
        expect(wrongCount).toBe(1)
      }).pipe(Effect.provide(ComparisonServiceLive))
    )
  })

  describe("edge cases", () => {
    it.effect("handles rapid repeated notes", () =>
      Effect.gen(function* () {
        const service = yield* ComparisonService

        // Three rapid C4s at 0ms, 100ms, 200ms
        const expected = [
          note(60, 0),
          note(60, 100),
          note(60, 200),
        ]

        // Play three C4s rapidly
        const playedNotes = [
          played(60, 20),
          played(60, 110),
          played(60, 190),
        ]

        const result = yield* service.compare(expected, playedNotes, "both")

        expect(result.noteAccuracy).toBe(1)
        expect(result.missedNotes.length).toBe(0)
      }).pipe(Effect.provide(ComparisonServiceLive))
    )

    it.effect("handles notes arriving out of timestamp order", () =>
      Effect.gen(function* () {
        const service = yield* ComparisonService

        // Sequential notes
        const expected = [
          note(60, 0),
          note(62, 500),
          note(64, 1000),
        ]

        // Notes arrive in different order due to timing
        // (e.g., WebSocket message ordering)
        const playedNotes = [
          played(62, 520), // Second note plays first
          played(60, 30),  // First note plays second
          played(64, 1010),
        ]

        const result = yield* service.compare(expected, playedNotes, "both")

        // Should still match correctly based on closest timing distance
        expect(result.noteAccuracy).toBe(1)
        expect(result.missedNotes.length).toBe(0)

        // Verify each note matched to correct expected note
        expect(result.matchResults[0]!.expectedNote?.pitch).toBe(62)
        expect(result.matchResults[1]!.expectedNote?.pitch).toBe(60)
        expect(result.matchResults[2]!.expectedNote?.pitch).toBe(64)
      }).pipe(Effect.provide(ComparisonServiceLive))
    )

    it.effect("handles empty measure (no expected notes)", () =>
      Effect.gen(function* () {
        const service = yield* ComparisonService

        // No expected notes
        const expected: NoteEvent[] = []

        // User plays a note anyway
        const playedNotes = [played(60, 100)]

        const result = yield* service.compare(expected, playedNotes, "both")

        // Should be extra, accuracy is 0/0 = 0
        expect(result.noteAccuracy).toBe(0)
        expect(result.extraNotes).toBe(1)
        expect(result.missedNotes.length).toBe(0)
      }).pipe(Effect.provide(ComparisonServiceLive))
    )

    it.effect("handles playing nothing when notes expected", () =>
      Effect.gen(function* () {
        const service = yield* ComparisonService

        const expected = [note(60, 0), note(62, 500)]

        // User plays nothing
        const playedNotes: PlayedNote[] = []

        const result = yield* service.compare(expected, playedNotes, "both")

        expect(result.noteAccuracy).toBe(0)
        expect(result.missedNotes.length).toBe(2)
        expect(result.matchResults.length).toBe(0)
      }).pipe(Effect.provide(ComparisonServiceLive))
    )

    it.effect("handles very late notes beyond tolerance as wrong", () =>
      Effect.gen(function* () {
        const service = yield* ComparisonService

        const expected = [note(60, 0)]

        // Play 500ms late (way outside 150ms tolerance)
        const playedNotes = [played(60, 500)]

        const result = yield* service.compare(expected, playedNotes, "both")

        // Note matches by pitch but is wrong due to timing
        const wrongCount = result.matchResults.filter(
          (r) => r.result === "wrong"
        ).length
        expect(wrongCount).toBe(1)
        expect(result.matchResults[0]!.timingOffset).toBe(500)
      }).pipe(Effect.provide(ComparisonServiceLive))
    )
  })
})
