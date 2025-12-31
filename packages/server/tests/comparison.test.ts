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
  })
})
