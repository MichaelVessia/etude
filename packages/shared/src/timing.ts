/**
 * Timing reference frame types and conversion utilities.
 *
 * The codebase uses three timing reference frames:
 * - PieceTime: ms from piece start (0 = first beat of piece, from Verovio onset)
 * - SessionTime: ms from session start (0 = when user clicked start)
 * - PlaybackTime: ms from first played note (0 = when user plays first note)
 *
 * These branded types prevent accidental conflation of reference frames at compile time.
 *
 * Timestamp usages audit:
 * - NoteEvent.startTime: PieceTime (Verovio onset, absolute position in piece)
 * - PlayedNote.timestamp: PlaybackTime (relative to first played note)
 * - session.ts expectedNotes: PieceTime adjusted for tempo and measure offset
 * - session.ts originalNotes: PieceTime (unmodified for UI mapping)
 * - session.ts firstNoteOffset: SessionTime (wall clock when first note played)
 * - Playhead position: PieceTime (maps to score position)
 */

import { Schema } from "effect"

// Branded types for timing reference frames

/** Time in milliseconds from piece start (0 = first beat of piece, from Verovio onset) */
export const PieceTime = Schema.Number.pipe(Schema.brand("PieceTime"))
export type PieceTime = typeof PieceTime.Type

/** Time in milliseconds from session start (0 = when user clicked start) */
export const SessionTime = Schema.Number.pipe(Schema.brand("SessionTime"))
export type SessionTime = typeof SessionTime.Type

/** Time in milliseconds from first played note (0 = when user plays first note) */
export const PlaybackTime = Schema.Number.pipe(Schema.brand("PlaybackTime"))
export type PlaybackTime = typeof PlaybackTime.Type

// Conversion context: captures the relationship between reference frames

/**
 * Timing context for converting between reference frames.
 *
 * In a practice session:
 * - pieceOffset: The PieceTime of the first expected note (may be non-zero if starting mid-piece)
 * - tempoRatio: 100 / tempo (e.g., at 50% speed, tempoRatio = 2.0)
 */
export interface TimingContext {
  /** PieceTime of the first expected note in the session */
  readonly pieceOffset: PieceTime
  /** Ratio for tempo adjustment: 100 / tempo (1.0 = normal speed) */
  readonly tempoRatio: number
}

// Conversion functions

/**
 * Create a PieceTime from a raw number.
 * Use when you have a known piece-relative timestamp (e.g., from Verovio).
 */
export function pieceTime(ms: number): PieceTime {
  return ms as PieceTime
}

/**
 * Create a SessionTime from a raw number.
 * Use when you have a wall-clock timestamp relative to session start.
 */
export function sessionTime(ms: number): SessionTime {
  return ms as SessionTime
}

/**
 * Create a PlaybackTime from a raw number.
 * Use when you have a timestamp relative to first played note.
 */
export function playbackTime(ms: number): PlaybackTime {
  return ms as PlaybackTime
}

/**
 * Convert PieceTime to PlaybackTime.
 *
 * This is used when comparing expected note times (in piece reference) to played note times
 * (in playback reference). The conversion accounts for:
 * 1. The offset of the first expected note (pieceOffset)
 * 2. Tempo adjustment (tempoRatio)
 *
 * Formula: playbackTime = (pieceTime - pieceOffset) * tempoRatio
 */
export function pieceToPlayback(time: PieceTime, ctx: TimingContext): PlaybackTime {
  const adjusted = (time - ctx.pieceOffset) * ctx.tempoRatio
  return adjusted as PlaybackTime
}

/**
 * Convert PlaybackTime to PieceTime.
 *
 * Inverse of pieceToPlayback. Used for mapping played notes back to score positions.
 *
 * Formula: pieceTime = (playbackTime / tempoRatio) + pieceOffset
 */
export function playbackToPiece(time: PlaybackTime, ctx: TimingContext): PieceTime {
  const adjusted = time / ctx.tempoRatio + ctx.pieceOffset
  return adjusted as PieceTime
}

/**
 * Create a TimingContext for a practice session.
 *
 * @param firstExpectedNote - PieceTime of the first expected note
 * @param tempo - Tempo percentage (100 = normal, 50 = half speed)
 */
export function createTimingContext(
  firstExpectedNote: PieceTime,
  tempo: number
): TimingContext {
  return {
    pieceOffset: firstExpectedNote,
    tempoRatio: 100 / tempo,
  }
}

/**
 * Adjust a PieceTime for tempo without changing reference frame.
 * Used when creating tempo-adjusted expected notes.
 *
 * The result is still in PieceTime reference, just scaled for tempo.
 */
export function adjustForTempo(
  time: PieceTime,
  baseTime: PieceTime,
  tempoRatio: number
): PieceTime {
  const adjusted = (time - baseTime) * tempoRatio
  return adjusted as PieceTime
}

// Simple tempo conversion functions for playhead/UI timing

/**
 * Convert piece time to wall-clock playback time at a given tempo.
 *
 * This answers: "How much wall time will pass to reach this point in the piece?"
 *
 * At 50% tempo, a note at 1000ms piece time takes 2000ms wall time to reach.
 * At 150% tempo, a note at 1000ms piece time takes 667ms wall time to reach.
 *
 * @param pieceTimeMs - Position in piece (milliseconds)
 * @param tempoPercent - Tempo as percentage (100 = normal, 50 = half speed)
 * @returns Wall-clock time in milliseconds
 */
export function pieceToPlaybackTime(pieceTimeMs: number, tempoPercent: number): number {
  return pieceTimeMs * (100 / tempoPercent)
}

/**
 * Convert wall-clock playback time to piece time at a given tempo.
 *
 * This answers: "How far into the piece are we after this much wall time?"
 *
 * At 50% tempo, 2000ms wall time = 1000ms piece time.
 * At 150% tempo, 667ms wall time = 1000ms piece time.
 *
 * @param playbackTimeMs - Wall-clock time elapsed (milliseconds)
 * @param tempoPercent - Tempo as percentage (100 = normal, 50 = half speed)
 * @returns Position in piece in milliseconds
 */
export function playbackToPieceTime(playbackTimeMs: number, tempoPercent: number): number {
  return playbackTimeMs * (tempoPercent / 100)
}

/**
 * Convert a duration from wall time to piece time.
 *
 * Used for converting grace periods: at slower tempos, the same wall-time
 * grace period represents a smaller piece-time interval.
 *
 * @param wallTimeMs - Duration in wall-clock milliseconds
 * @param tempoPercent - Tempo as percentage (100 = normal, 50 = half speed)
 * @returns Duration in piece-time milliseconds
 */
export function wallTimeToPieceTime(wallTimeMs: number, tempoPercent: number): number {
  return wallTimeMs * (tempoPercent / 100)
}
