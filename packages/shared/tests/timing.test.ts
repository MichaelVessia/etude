import { describe, expect, it } from "@codeforbreakfast/bun-test-effect"
import { Schema } from "effect"
import {
  PieceTime,
  SessionTime,
  PlaybackTime,
  pieceTime,
  sessionTime,
  playbackTime,
  pieceToPlayback,
  playbackToPiece,
  createTimingContext,
  adjustForTempo,
  pieceToPlaybackTime,
  playbackToPieceTime,
  wallTimeToPieceTime,
} from "../src/timing.js"

describe("timing types", () => {
  describe("branded types", () => {
    it("PieceTime encodes and decodes", () => {
      const time = 1000
      const encoded = Schema.encodeSync(PieceTime)(time as PieceTime)
      const decoded = Schema.decodeSync(PieceTime)(encoded)
      expect(decoded).toBe(time)
    })

    it("SessionTime encodes and decodes", () => {
      const time = 5000
      const encoded = Schema.encodeSync(SessionTime)(time as SessionTime)
      const decoded = Schema.decodeSync(SessionTime)(encoded)
      expect(decoded).toBe(time)
    })

    it("PlaybackTime encodes and decodes", () => {
      const time = 2500
      const encoded = Schema.encodeSync(PlaybackTime)(time as PlaybackTime)
      const decoded = Schema.decodeSync(PlaybackTime)(encoded)
      expect(decoded).toBe(time)
    })
  })

  describe("factory functions", () => {
    it("pieceTime creates PieceTime", () => {
      const t = pieceTime(1000)
      // Should compile as PieceTime
      const encoded = Schema.encodeSync(PieceTime)(t)
      expect(encoded).toBe(1000)
    })

    it("sessionTime creates SessionTime", () => {
      const t = sessionTime(5000)
      const encoded = Schema.encodeSync(SessionTime)(t)
      expect(encoded).toBe(5000)
    })

    it("playbackTime creates PlaybackTime", () => {
      const t = playbackTime(2500)
      const encoded = Schema.encodeSync(PlaybackTime)(t)
      expect(encoded).toBe(2500)
    })
  })

  describe("createTimingContext", () => {
    it("creates context with normal tempo", () => {
      const ctx = createTimingContext(pieceTime(1000), 100)
      expect(ctx.pieceOffset).toBe(1000)
      expect(ctx.tempoRatio).toBe(1.0)
    })

    it("creates context with half tempo", () => {
      const ctx = createTimingContext(pieceTime(2000), 50)
      expect(ctx.pieceOffset).toBe(2000)
      expect(ctx.tempoRatio).toBe(2.0)
    })

    it("creates context with double tempo", () => {
      const ctx = createTimingContext(pieceTime(500), 200)
      expect(ctx.pieceOffset).toBe(500)
      expect(ctx.tempoRatio).toBe(0.5)
    })
  })

  describe("pieceToPlayback", () => {
    it("converts at normal tempo with zero offset", () => {
      const ctx = createTimingContext(pieceTime(0), 100)
      const result = pieceToPlayback(pieceTime(1000), ctx)
      expect(result).toBe(1000)
    })

    it("converts at normal tempo with offset", () => {
      // If piece starts at 2000ms (e.g., starting from measure 5)
      // and we play a note at pieceTime 3000ms
      // the playback time should be 1000ms (3000 - 2000)
      const ctx = createTimingContext(pieceTime(2000), 100)
      const result = pieceToPlayback(pieceTime(3000), ctx)
      expect(result).toBe(1000)
    })

    it("converts at half tempo", () => {
      // At 50% tempo, notes take 2x as long
      // PieceTime 500ms from offset should become PlaybackTime 1000ms
      const ctx = createTimingContext(pieceTime(0), 50)
      const result = pieceToPlayback(pieceTime(500), ctx)
      expect(result).toBe(1000)
    })

    it("converts at double tempo", () => {
      // At 200% tempo, notes take 0.5x as long
      // PieceTime 1000ms from offset should become PlaybackTime 500ms
      const ctx = createTimingContext(pieceTime(0), 200)
      const result = pieceToPlayback(pieceTime(1000), ctx)
      expect(result).toBe(500)
    })

    it("combines offset and tempo", () => {
      // Start at measure with offset 2000ms, half tempo
      // PieceTime 3000ms -> relative 1000ms -> scaled to 2000ms PlaybackTime
      const ctx = createTimingContext(pieceTime(2000), 50)
      const result = pieceToPlayback(pieceTime(3000), ctx)
      expect(result).toBe(2000)
    })
  })

  describe("playbackToPiece", () => {
    it("converts at normal tempo with zero offset", () => {
      const ctx = createTimingContext(pieceTime(0), 100)
      const result = playbackToPiece(playbackTime(1000), ctx)
      expect(result).toBe(1000)
    })

    it("converts at normal tempo with offset", () => {
      // PlaybackTime 1000ms with offset 2000ms -> PieceTime 3000ms
      const ctx = createTimingContext(pieceTime(2000), 100)
      const result = playbackToPiece(playbackTime(1000), ctx)
      expect(result).toBe(3000)
    })

    it("converts at half tempo", () => {
      // At 50% tempo, PlaybackTime 2000ms -> PieceTime 1000ms
      const ctx = createTimingContext(pieceTime(0), 50)
      const result = playbackToPiece(playbackTime(2000), ctx)
      expect(result).toBe(1000)
    })

    it("converts at double tempo", () => {
      // At 200% tempo, PlaybackTime 500ms -> PieceTime 1000ms
      const ctx = createTimingContext(pieceTime(0), 200)
      const result = playbackToPiece(playbackTime(500), ctx)
      expect(result).toBe(1000)
    })

    it("is inverse of pieceToPlayback", () => {
      const ctx = createTimingContext(pieceTime(1500), 75)
      const original = pieceTime(3000)
      const playback = pieceToPlayback(original, ctx)
      const roundTrip = playbackToPiece(playback, ctx)
      expect(roundTrip).toBeCloseTo(original, 10)
    })
  })

  describe("adjustForTempo", () => {
    it("adjusts at normal tempo (no change)", () => {
      const result = adjustForTempo(pieceTime(1000), pieceTime(0), 1.0)
      expect(result).toBe(1000)
    })

    it("adjusts at half speed (2x duration)", () => {
      // tempoRatio of 2.0 means half speed
      const result = adjustForTempo(pieceTime(1000), pieceTime(0), 2.0)
      expect(result).toBe(2000)
    })

    it("adjusts at double speed (0.5x duration)", () => {
      const result = adjustForTempo(pieceTime(1000), pieceTime(0), 0.5)
      expect(result).toBe(500)
    })

    it("adjusts with base time offset", () => {
      // Note at 3000ms, base at 2000ms, half speed
      // Relative time: 1000ms, scaled: 2000ms
      const result = adjustForTempo(pieceTime(3000), pieceTime(2000), 2.0)
      expect(result).toBe(2000)
    })
  })

  describe("pieceToPlaybackTime", () => {
    it("returns same time at 100% tempo", () => {
      expect(pieceToPlaybackTime(1000, 100)).toBe(1000)
    })

    it("at 50% tempo: piece time takes 2x wall time", () => {
      // 1000ms piece time takes 2000ms wall time at 50% tempo
      expect(pieceToPlaybackTime(1000, 50)).toBe(2000)
    })

    it("at 150% tempo: piece time takes less wall time", () => {
      // 1000ms piece time takes ~667ms wall time at 150% tempo
      expect(pieceToPlaybackTime(1000, 150)).toBeCloseTo(666.67, 1)
    })

    it("at 200% tempo: piece time takes half wall time", () => {
      expect(pieceToPlaybackTime(1000, 200)).toBe(500)
    })
  })

  describe("playbackToPieceTime", () => {
    it("returns same time at 100% tempo", () => {
      expect(playbackToPieceTime(1000, 100)).toBe(1000)
    })

    it("at 50% tempo: wall time covers less piece time", () => {
      // 2000ms wall time = 1000ms piece time at 50% tempo
      expect(playbackToPieceTime(2000, 50)).toBe(1000)
    })

    it("at 150% tempo: wall time covers more piece time", () => {
      // 1000ms wall time = 1500ms piece time at 150% tempo
      expect(playbackToPieceTime(1000, 150)).toBe(1500)
    })

    it("is inverse of pieceToPlaybackTime", () => {
      const pieceMs = 1234
      const tempo = 75
      const playback = pieceToPlaybackTime(pieceMs, tempo)
      const roundTrip = playbackToPieceTime(playback, tempo)
      expect(roundTrip).toBeCloseTo(pieceMs, 10)
    })
  })

  describe("wallTimeToPieceTime", () => {
    it("returns same duration at 100% tempo", () => {
      expect(wallTimeToPieceTime(300, 100)).toBe(300)
    })

    it("at 50% tempo: 300ms wall = 150ms piece time", () => {
      // At slower tempo, same wall time covers less piece time
      expect(wallTimeToPieceTime(300, 50)).toBe(150)
    })

    it("at 150% tempo: 300ms wall = 450ms piece time", () => {
      // At faster tempo, same wall time covers more piece time
      expect(wallTimeToPieceTime(300, 150)).toBe(450)
    })

    it("used for grace period conversion", () => {
      // Grace period of 300ms wall time at various tempos
      // This is the key use case for missed note detection

      // At 50% tempo: grace period in piece time is smaller
      const grace50 = wallTimeToPieceTime(300, 50)
      expect(grace50).toBe(150)

      // At 100% tempo: grace period unchanged
      const grace100 = wallTimeToPieceTime(300, 100)
      expect(grace100).toBe(300)

      // At 150% tempo: grace period in piece time is larger
      const grace150 = wallTimeToPieceTime(300, 150)
      expect(grace150).toBe(450)
    })
  })
})
