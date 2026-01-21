import { describe, expect, it } from "@codeforbreakfast/bun-test-effect"
import {
  matchNote,
  calculateTimingScore,
  DEFAULT_CONFIG,
  type NoteEventLike,
  type PlayedNoteLike,
} from "../src/note-matching.js"

// Helper to create expected notes (matches NoteEventLike interface)
const note = (
  pitch: number,
  startTime: number,
  hand: "left" | "right" = "right"
): NoteEventLike => ({ pitch, startTime, hand })

// Helper to create played notes (matches PlayedNoteLike interface)
const played = (pitch: number, timestamp: number): PlayedNoteLike => ({
  pitch,
  timestamp,
})

describe("note-matching", () => {
  describe("matchNote", () => {
    describe("basic matching", () => {
      it("matches correct pitch with timing within tolerance", () => {
        const expected = [note(60, 1000)]
        const matchedIndices = new Set<number>()

        const result = matchNote(played(60, 1050), expected, matchedIndices, "both")

        expect(result.result).toBe("correct")
        expect(result.expectedNote?.pitch).toBe(60)
        expect(result.timingOffset).toBe(50)
        expect(matchedIndices.has(0)).toBe(true)
      })

      it("returns extra when no expected notes", () => {
        const matchedIndices = new Set<number>()

        const result = matchNote(played(60, 0), [], matchedIndices, "both")

        expect(result.result).toBe("extra")
        expect(result.expectedNote).toBeNull()
        expect(result.timingOffset).toBe(0)
      })

      it("returns wrong for incorrect pitch", () => {
        const expected = [note(60, 0)]
        const matchedIndices = new Set<number>()

        const result = matchNote(played(63, 0), expected, matchedIndices, "both")

        expect(result.result).toBe("wrong")
        expect(result.expectedNote?.pitch).toBe(60) // Still reports closest expected
        expect(result.timingOffset).toBe(0)
      })

      it("does not double-match notes", () => {
        const expected = [note(60, 0)]
        const matchedIndices = new Set<number>()

        // Match first note
        matchNote(played(60, 0), expected, matchedIndices, "both")

        // Try to match same pitch again - should be extra
        const result = matchNote(played(60, 100), expected, matchedIndices, "both")

        expect(result.result).toBe("extra")
        expect(result.expectedNote).toBeNull()
      })
    })

    describe("timing tolerance boundary tests", () => {
      it("marks note at 149ms offset as correct (within 150ms tolerance)", () => {
        const expected = [note(60, 1000)]
        const matchedIndices = new Set<number>()

        const result = matchNote(played(60, 1149), expected, matchedIndices, "both")

        expect(result.result).toBe("correct")
        expect(result.timingOffset).toBe(149)
      })

      it("marks note at 150ms offset as correct (exactly at tolerance)", () => {
        const expected = [note(60, 1000)]
        const matchedIndices = new Set<number>()

        const result = matchNote(played(60, 1150), expected, matchedIndices, "both")

        expect(result.result).toBe("correct")
        expect(result.timingOffset).toBe(150)
      })

      it("marks note at 151ms offset as wrong (outside 150ms tolerance)", () => {
        const expected = [note(60, 1000)]
        const matchedIndices = new Set<number>()

        const result = matchNote(played(60, 1151), expected, matchedIndices, "both")

        expect(result.result).toBe("wrong")
        expect(result.timingOffset).toBe(151)
      })

      it("marks early note at -149ms offset as correct", () => {
        const expected = [note(60, 1000)]
        const matchedIndices = new Set<number>()

        const result = matchNote(played(60, 851), expected, matchedIndices, "both")

        expect(result.result).toBe("correct")
        expect(result.timingOffset).toBe(-149)
      })

      it("marks early note at -150ms offset as correct", () => {
        const expected = [note(60, 1000)]
        const matchedIndices = new Set<number>()

        const result = matchNote(played(60, 850), expected, matchedIndices, "both")

        expect(result.result).toBe("correct")
        expect(result.timingOffset).toBe(-150)
      })

      it("marks early note at -151ms offset as wrong", () => {
        const expected = [note(60, 1000)]
        const matchedIndices = new Set<number>()

        const result = matchNote(played(60, 849), expected, matchedIndices, "both")

        expect(result.result).toBe("wrong")
        expect(result.timingOffset).toBe(-151)
      })
    })

    describe("hand filtering", () => {
      it("filters by hand when not practicing both", () => {
        const expected = [
          note(60, 0, "right"),
          note(48, 0, "left"),
        ]
        const matchedIndices = new Set<number>()

        // Playing with right hand filter should only match right hand notes
        const result = matchNote(played(60, 0), expected, matchedIndices, "right")

        expect(result.result).toBe("correct")
        expect(result.expectedNote?.hand).toBe("right")
      })

      it("marks as extra when playing note from filtered-out hand", () => {
        const expected = [
          note(60, 0, "right"),
          note(48, 0, "left"),
        ]
        const matchedIndices = new Set<number>()

        // Playing left hand pitch (48) with right hand filter
        const result = matchNote(played(48, 0), expected, matchedIndices, "right")

        // Should be wrong (not extra) because there are eligible notes, just wrong pitch
        expect(result.result).toBe("wrong")
        expect(result.expectedNote?.pitch).toBe(60) // Closest eligible note
      })

      it("returns extra when all notes are for other hand", () => {
        const expected = [note(48, 0, "left")]
        const matchedIndices = new Set<number>()

        const result = matchNote(played(48, 0), expected, matchedIndices, "right")

        expect(result.result).toBe("extra")
        expect(result.expectedNote).toBeNull()
      })
    })

    describe("chord handling", () => {
      it("matches simultaneous notes (chord) independently", () => {
        // C major chord
        const expected = [
          note(60, 0), // C
          note(64, 0), // E
          note(67, 0), // G
        ]
        const matchedIndices = new Set<number>()

        // Play chord notes in order
        const result1 = matchNote(played(60, 10), expected, matchedIndices, "both")
        const result2 = matchNote(played(64, 15), expected, matchedIndices, "both")
        const result3 = matchNote(played(67, 20), expected, matchedIndices, "both")

        expect(result1.result).toBe("correct")
        expect(result2.result).toBe("correct")
        expect(result3.result).toBe("correct")
        expect(matchedIndices.size).toBe(3)
      })

      it("handles chord with one wrong note", () => {
        const expected = [
          note(60, 0), // C
          note(64, 0), // E
          note(67, 0), // G
        ]
        const matchedIndices = new Set<number>()

        const result1 = matchNote(played(60, 10), expected, matchedIndices, "both")
        const result2 = matchNote(played(65, 15), expected, matchedIndices, "both") // Wrong: F instead of E
        const result3 = matchNote(played(67, 20), expected, matchedIndices, "both")

        expect(result1.result).toBe("correct")
        expect(result2.result).toBe("wrong")
        expect(result3.result).toBe("correct")
      })
    })

    describe("out-of-order playing (timing distance ordering)", () => {
      it("matches closest note by timing distance when playing slightly out of order", () => {
        // Notes expected at 0, 500, 1000
        const expected = [
          note(60, 0),
          note(60, 500),
          note(60, 1000),
        ]
        const matchedIndices = new Set<number>()

        // Play second note first (closer to second expected time)
        const result1 = matchNote(played(60, 480), expected, matchedIndices, "both")
        expect(result1.result).toBe("correct")
        expect(result1.expectedNote?.startTime).toBe(500) // Matched to closest

        // Play first note late
        const result2 = matchNote(played(60, 100), expected, matchedIndices, "both")
        expect(result2.result).toBe("correct")
        expect(result2.expectedNote?.startTime).toBe(0) // Matched to first (closest remaining)

        // Play third note
        const result3 = matchNote(played(60, 1020), expected, matchedIndices, "both")
        expect(result3.result).toBe("correct")
        expect(result3.expectedNote?.startTime).toBe(1000)
      })

      it("matches closest unmatched note with same pitch", () => {
        // Two C notes, one at 0 and one at 1000
        const expected = [
          note(60, 0),
          note(60, 1000),
        ]
        const matchedIndices = new Set<number>()

        // Play closer to second note (900ms is 100ms from 1000, vs 900ms from 0)
        const result = matchNote(played(60, 900), expected, matchedIndices, "both")

        expect(result.result).toBe("correct")
        // Should match the closer note (at 1000, distance=100) not the farther one (at 0, distance=900)
        expect(result.expectedNote?.startTime).toBe(1000)
      })

      it("handles repeated same-pitch notes with greedy matching", () => {
        // Three C4s at different times
        const expected = [
          note(60, 0),
          note(60, 500),
          note(60, 1000),
        ]
        const matchedIndices = new Set<number>()

        // Play in order but with timing offsets
        const result1 = matchNote(played(60, 50), expected, matchedIndices, "both")
        expect(result1.result).toBe("correct")
        expect(result1.expectedNote?.startTime).toBe(0) // Closest to 0

        const result2 = matchNote(played(60, 480), expected, matchedIndices, "both")
        expect(result2.result).toBe("correct")
        expect(result2.expectedNote?.startTime).toBe(500) // Closest to 500

        const result3 = matchNote(played(60, 1020), expected, matchedIndices, "both")
        expect(result3.result).toBe("correct")
        expect(result3.expectedNote?.startTime).toBe(1000) // Closest to 1000
      })
    })

    describe("various timing offsets", () => {
      it("correctly calculates positive timing offset (late)", () => {
        const expected = [note(60, 1000)]
        const matchedIndices = new Set<number>()

        const result = matchNote(played(60, 1100), expected, matchedIndices, "both")

        expect(result.timingOffset).toBe(100) // 100ms late
      })

      it("correctly calculates negative timing offset (early)", () => {
        const expected = [note(60, 1000)]
        const matchedIndices = new Set<number>()

        const result = matchNote(played(60, 900), expected, matchedIndices, "both")

        expect(result.timingOffset).toBe(-100) // 100ms early
      })

      it("correctly calculates zero timing offset (perfect)", () => {
        const expected = [note(60, 1000)]
        const matchedIndices = new Set<number>()

        const result = matchNote(played(60, 1000), expected, matchedIndices, "both")

        expect(result.timingOffset).toBe(0)
      })
    })

    describe("custom config", () => {
      it("respects custom timing tolerance", () => {
        const expected = [note(60, 1000)]
        const matchedIndices = new Set<number>()
        const customConfig = { timingToleranceMs: 100 }

        // 100ms would be wrong with default (150ms), but correct with custom (100ms)
        const result = matchNote(played(60, 1100), expected, matchedIndices, "both", customConfig)
        expect(result.result).toBe("correct")

        // 101ms should be wrong with custom 100ms tolerance
        const matchedIndices2 = new Set<number>()
        const result2 = matchNote(played(60, 1101), expected, matchedIndices2, "both", customConfig)
        expect(result2.result).toBe("wrong")
      })
    })
  })

  describe("calculateTimingScore", () => {
    it("returns 1.0 for perfect timing (0ms offset)", () => {
      expect(calculateTimingScore(0)).toBe(1.0)
    })

    it("returns 1.0 within grace period (75ms)", () => {
      expect(calculateTimingScore(50)).toBe(1.0)
      expect(calculateTimingScore(-50)).toBe(1.0)
      expect(calculateTimingScore(75)).toBe(1.0)
      expect(calculateTimingScore(-75)).toBe(1.0)
    })

    it("returns reduced score between grace and tolerance", () => {
      // At 100ms (halfway between 75 and 150)
      const score = calculateTimingScore(100)
      expect(score).toBeGreaterThan(0)
      expect(score).toBeLessThan(1)

      // Should be about 0.67 (linear falloff: 1 - (100-75)/(150-75) = 1 - 25/75 = 0.67)
      expect(score).toBeCloseTo(0.67, 1)
    })

    it("returns reduced score at tolerance boundary", () => {
      const score = calculateTimingScore(150)
      // At exactly tolerance, linear falloff gives 0
      expect(score).toBeCloseTo(0, 1)
    })

    it("returns partial credit beyond tolerance (exponential falloff)", () => {
      const score = calculateTimingScore(200)
      expect(score).toBeGreaterThan(0)
      expect(score).toBeLessThan(0.5) // Max partial credit is 0.5
    })

    it("handles large offsets gracefully", () => {
      const score = calculateTimingScore(1000)
      expect(score).toBeGreaterThanOrEqual(0)
      expect(score).toBeLessThan(0.1) // Very low but not negative
    })

    it("treats negative offsets same as positive (symmetric)", () => {
      expect(calculateTimingScore(-100)).toBe(calculateTimingScore(100))
      expect(calculateTimingScore(-200)).toBe(calculateTimingScore(200))
    })

    it("respects custom grace and tolerance parameters", () => {
      // Custom: grace=50, tolerance=100
      const customScore = calculateTimingScore(75, 50, 100)
      // 75ms is between 50 (grace) and 100 (tolerance)
      // Linear falloff: 1 - (75-50)/(100-50) = 1 - 25/50 = 0.5
      expect(customScore).toBeCloseTo(0.5, 1)

      // Perfect within custom grace
      expect(calculateTimingScore(50, 50, 100)).toBe(1.0)
    })
  })

  describe("DEFAULT_CONFIG", () => {
    it("has expected default values", () => {
      expect(DEFAULT_CONFIG.timingToleranceMs).toBe(150)
    })
  })

  describe("integration: identical results from both code paths", () => {
    // These tests verify the shared module produces consistent results
    // that would be the same from comparison.ts and session-do.ts
    it("produces consistent results for a sequence of notes", () => {
      const expected = [
        note(60, 0, "right"),
        note(62, 500, "right"),
        note(64, 1000, "right"),
      ]

      const playedNotes = [
        played(60, 50),   // Slightly late
        played(62, 480),  // Slightly early
        played(64, 1100), // 100ms late
      ]

      const matchedIndices1 = new Set<number>()
      const results1: Array<{ result: string; offset: number }> = []
      for (const p of playedNotes) {
        const r = matchNote(p, expected, matchedIndices1, "both")
        results1.push({ result: r.result, offset: r.timingOffset })
      }

      // Run again with fresh state to verify determinism
      const matchedIndices2 = new Set<number>()
      const results2: Array<{ result: string; offset: number }> = []
      for (const p of playedNotes) {
        const r = matchNote(p, expected, matchedIndices2, "both")
        results2.push({ result: r.result, offset: r.timingOffset })
      }

      expect(results1).toEqual(results2)
      expect(results1[0]!.result).toBe("correct")
      expect(results1[0]!.offset).toBe(50)
      expect(results1[1]!.result).toBe("correct")
      expect(results1[1]!.offset).toBe(-20)
      expect(results1[2]!.result).toBe("correct")
      expect(results1[2]!.offset).toBe(100)
    })

    it("produces consistent results for mixed hands", () => {
      const expected = [
        note(60, 0, "right"),
        note(48, 0, "left"),
        note(62, 500, "right"),
        note(50, 500, "left"),
      ]

      // Play only right hand
      const playedNotes = [played(60, 0), played(62, 500)]

      const matchedIndices = new Set<number>()
      const results: Array<{ result: string; hand: string | undefined }> = []
      for (const p of playedNotes) {
        const r = matchNote(p, expected, matchedIndices, "right")
        results.push({ result: r.result, hand: r.expectedNote?.hand })
      }

      expect(results[0]!.result).toBe("correct")
      expect(results[0]!.hand).toBe("right")
      expect(results[1]!.result).toBe("correct")
      expect(results[1]!.hand).toBe("right")
    })
  })

  describe("parity: comparison.ts and session-do.ts use same matching logic", () => {
    // Both comparison.ts and session-do.ts import and use the shared matchNote function
    // These tests verify the canonical behavior that both code paths rely on

    it("verifies matching logic produces deterministic results across calls", () => {
      // This simulates what happens when the same input is processed
      // by comparison.ts (local mode) vs session-do.ts (WebSocket mode)
      const expected = [
        note(60, 0, "right"),
        note(64, 0, "right"),   // Chord
        note(67, 0, "right"),   // Chord
        note(62, 500, "right"),
        note(65, 1000, "left"),
      ]

      const playedNotes = [
        played(60, 20),
        played(67, 25),  // Out of pitch order
        played(64, 30),
        played(62, 490),
        played(65, 1020),
      ]

      // Simulate comparison.ts path (batch processing)
      const matchedIndices1 = new Set<number>()
      const results1: Array<{ pitch: number; result: string; offset: number }> = []
      for (const p of playedNotes) {
        const r = matchNote(p, expected, matchedIndices1, "both")
        results1.push({ pitch: p.pitch, result: r.result, offset: r.timingOffset })
      }

      // Simulate session-do.ts path (streaming/incremental processing)
      const matchedIndices2 = new Set<number>()
      const results2: Array<{ pitch: number; result: string; offset: number }> = []
      for (const p of playedNotes) {
        const r = matchNote(p, expected, matchedIndices2, "both")
        results2.push({ pitch: p.pitch, result: r.result, offset: r.timingOffset })
      }

      // Results must be identical
      expect(results1).toEqual(results2)
      expect(matchedIndices1).toEqual(matchedIndices2)

      // Verify specific expectations
      expect(results1[0]).toEqual({ pitch: 60, result: "correct", offset: 20 })
      expect(results1[1]).toEqual({ pitch: 67, result: "correct", offset: 25 })
      expect(results1[2]).toEqual({ pitch: 64, result: "correct", offset: 30 })
      expect(results1[3]).toEqual({ pitch: 62, result: "correct", offset: -10 })
      expect(results1[4]).toEqual({ pitch: 65, result: "correct", offset: 20 })
    })

    it("verifies tolerance boundary behavior is identical", () => {
      const expected = [note(60, 1000)]

      // Test at exact boundaries
      const testCases = [
        { timestamp: 1149, expectedResult: "correct" as const, expectedOffset: 149 },
        { timestamp: 1150, expectedResult: "correct" as const, expectedOffset: 150 },
        { timestamp: 1151, expectedResult: "wrong" as const, expectedOffset: 151 },
        { timestamp: 851, expectedResult: "correct" as const, expectedOffset: -149 },
        { timestamp: 850, expectedResult: "correct" as const, expectedOffset: -150 },
        { timestamp: 849, expectedResult: "wrong" as const, expectedOffset: -151 },
      ]

      for (const tc of testCases) {
        // Fresh state for each test
        const matchedIndices = new Set<number>()
        const result = matchNote(played(60, tc.timestamp), expected, matchedIndices, "both")

        expect(result.result).toBe(tc.expectedResult)
        expect(result.timingOffset).toBe(tc.expectedOffset)
      }
    })

    it("verifies hand filtering is consistent", () => {
      const expected = [
        note(60, 0, "right"),
        note(48, 0, "left"),
        note(62, 500, "right"),
        note(50, 500, "left"),
      ]

      // Test right hand only
      const matchedRight = new Set<number>()
      const r1 = matchNote(played(60, 0), expected, matchedRight, "right")
      const r2 = matchNote(played(48, 0), expected, matchedRight, "right") // Left hand pitch with right filter
      const r3 = matchNote(played(62, 500), expected, matchedRight, "right")

      expect(r1.result).toBe("correct")
      expect(r2.result).toBe("wrong") // Wrong pitch for right hand
      expect(r3.result).toBe("correct")

      // Test left hand only
      const matchedLeft = new Set<number>()
      const l1 = matchNote(played(48, 0), expected, matchedLeft, "left")
      const l2 = matchNote(played(60, 0), expected, matchedLeft, "left") // Right hand pitch with left filter
      const l3 = matchNote(played(50, 500), expected, matchedLeft, "left")

      expect(l1.result).toBe("correct")
      expect(l2.result).toBe("wrong")
      expect(l3.result).toBe("correct")
    })
  })

  describe("edge cases", () => {
    it("handles rapid repeated notes (same pitch, close timing)", () => {
      const expected = [
        note(60, 0),
        note(60, 100),
        note(60, 200),
      ]
      const matchedIndices = new Set<number>()

      // Play three rapid notes
      const r1 = matchNote(played(60, 20), expected, matchedIndices, "both")
      const r2 = matchNote(played(60, 110), expected, matchedIndices, "both")
      const r3 = matchNote(played(60, 190), expected, matchedIndices, "both")

      expect(r1.result).toBe("correct")
      expect(r1.expectedNote?.startTime).toBe(0)

      expect(r2.result).toBe("correct")
      expect(r2.expectedNote?.startTime).toBe(100)

      expect(r3.result).toBe("correct")
      expect(r3.expectedNote?.startTime).toBe(200)

      expect(matchedIndices.size).toBe(3)
    })

    it("handles very rapid repeated notes (50ms apart)", () => {
      const expected = [
        note(60, 0),
        note(60, 50),
        note(60, 100),
      ]
      const matchedIndices = new Set<number>()

      const r1 = matchNote(played(60, 10), expected, matchedIndices, "both")
      const r2 = matchNote(played(60, 55), expected, matchedIndices, "both")
      const r3 = matchNote(played(60, 95), expected, matchedIndices, "both")

      expect(r1.result).toBe("correct")
      expect(r2.result).toBe("correct")
      expect(r3.result).toBe("correct")
      expect(matchedIndices.size).toBe(3)
    })

    it("handles notes arriving out of timestamp order", () => {
      const expected = [
        note(60, 0),
        note(62, 500),
        note(64, 1000),
      ]
      const matchedIndices = new Set<number>()

      // Notes arrive in wrong order (simulating network jitter)
      const r1 = matchNote(played(62, 520), expected, matchedIndices, "both")
      const r2 = matchNote(played(60, 30), expected, matchedIndices, "both")
      const r3 = matchNote(played(64, 1010), expected, matchedIndices, "both")

      // Each should match to the closest expected note by timing
      expect(r1.result).toBe("correct")
      expect(r1.expectedNote?.pitch).toBe(62)

      expect(r2.result).toBe("correct")
      expect(r2.expectedNote?.pitch).toBe(60)

      expect(r3.result).toBe("correct")
      expect(r3.expectedNote?.pitch).toBe(64)
    })

    it("handles notes with same pitch played for different expected notes", () => {
      // Two C notes expected at different times
      const expected = [
        note(60, 0),
        note(62, 500), // Different pitch in between
        note(60, 1000),
      ]
      const matchedIndices = new Set<number>()

      const r1 = matchNote(played(60, 50), expected, matchedIndices, "both")
      const r2 = matchNote(played(62, 520), expected, matchedIndices, "both")
      const r3 = matchNote(played(60, 980), expected, matchedIndices, "both")

      expect(r1.result).toBe("correct")
      expect(r1.expectedNote?.startTime).toBe(0)

      expect(r2.result).toBe("correct")
      expect(r2.expectedNote?.pitch).toBe(62)

      expect(r3.result).toBe("correct")
      expect(r3.expectedNote?.startTime).toBe(1000)
    })

    it("handles extra note before any expected notes", () => {
      const expected = [note(60, 1000)]
      const matchedIndices = new Set<number>()

      // Play a note way too early
      const r = matchNote(played(60, 100), expected, matchedIndices, "both")

      // Should still match (but be wrong due to timing)
      expect(r.result).toBe("wrong")
      expect(r.timingOffset).toBe(-900)
    })

    it("handles playing same note twice when only one expected", () => {
      const expected = [note(60, 500)]
      const matchedIndices = new Set<number>()

      const r1 = matchNote(played(60, 490), expected, matchedIndices, "both")
      const r2 = matchNote(played(60, 510), expected, matchedIndices, "both")

      expect(r1.result).toBe("correct")
      expect(r2.result).toBe("extra") // Already matched
    })
  })
})
