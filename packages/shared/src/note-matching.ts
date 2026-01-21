/**
 * Pure note-matching module with zero Effect dependencies.
 * Canonical note matching logic for both comparison.ts (Effect) and session-do.ts (non-Effect).
 *
 * Matching strategy: Order by timing distance (closest first).
 * This handles edge cases better than ordering by startTime (e.g., notes slightly out of order).
 */

// Simple interfaces without Effect dependencies
export interface NoteEventLike {
  readonly pitch: number
  readonly startTime: number
  readonly hand: "left" | "right"
}

export interface PlayedNoteLike {
  readonly pitch: number
  readonly timestamp: number
}

export type MatchResultType = "correct" | "wrong" | "extra"

export interface NoteMatchResult<T extends NoteEventLike> {
  readonly playedNote: PlayedNoteLike
  readonly expectedNote: T | null
  readonly result: MatchResultType
  readonly timingOffset: number // ms from expected (negative = early)
}

export interface NoteMatchConfig {
  /** Timing tolerance in ms for a note to be considered "correct" */
  readonly timingToleranceMs: number
}

export const DEFAULT_CONFIG: NoteMatchConfig = {
  timingToleranceMs: 150,
}

/**
 * Matches a single played note against expected notes.
 *
 * Algorithm:
 * 1. Filter eligible notes (unmatched, matching hand filter)
 * 2. Find all notes with matching pitch
 * 3. Order by timing distance (closest first) - canonical behavior
 * 4. Return match result with timing offset
 *
 * @param playedNote - The note played by the user
 * @param expectedNotes - All expected notes in the piece/range
 * @param matchedIndices - Set of indices already matched (mutated on match)
 * @param hand - Hand filter ("left", "right", or "both")
 * @param config - Matching configuration
 * @returns Match result
 */
export function matchNote<T extends NoteEventLike>(
  playedNote: PlayedNoteLike,
  expectedNotes: readonly T[],
  matchedIndices: Set<number>,
  hand: "left" | "right" | "both",
  config: NoteMatchConfig = DEFAULT_CONFIG
): NoteMatchResult<T> {
  // Filter expected notes by hand and unmatched
  const eligibleNotes: Array<{ note: T; index: number }> = []
  for (let i = 0; i < expectedNotes.length; i++) {
    const note = expectedNotes[i]
    if (note === undefined) continue
    if (matchedIndices.has(i)) continue
    if (hand !== "both" && note.hand !== hand) continue
    eligibleNotes.push({ note, index: i })
  }

  if (eligibleNotes.length === 0) {
    return {
      playedNote,
      expectedNote: null,
      result: "extra",
      timingOffset: 0,
    }
  }

  // Find the closest unmatched note with the same pitch (greedy matching by distance)
  let bestMatch: { note: T; index: number } | null = null
  let bestDistance = Infinity

  for (const { note, index } of eligibleNotes) {
    if (note.pitch === playedNote.pitch) {
      const distance = Math.abs(playedNote.timestamp - note.startTime)
      if (distance < bestDistance) {
        bestDistance = distance
        bestMatch = { note, index }
      }
    }
  }

  if (bestMatch) {
    const timingOffset = playedNote.timestamp - bestMatch.note.startTime
    matchedIndices.add(bestMatch.index)

    const absOffset = Math.abs(timingOffset)
    const isCorrect = absOffset <= config.timingToleranceMs

    return {
      playedNote,
      expectedNote: bestMatch.note,
      result: isCorrect ? "correct" : "wrong",
      timingOffset,
    }
  }

  // No matching pitch found - this is a wrong note
  // Find the closest expected note by time to provide timing offset
  let closestByTime: { note: T; index: number } | null = null
  let closestTimeDistance = Infinity

  for (const { note, index } of eligibleNotes) {
    const distance = Math.abs(playedNote.timestamp - note.startTime)
    if (distance < closestTimeDistance) {
      closestTimeDistance = distance
      closestByTime = { note, index }
    }
  }

  if (closestByTime) {
    const timingOffset = playedNote.timestamp - closestByTime.note.startTime
    return {
      playedNote,
      expectedNote: closestByTime.note,
      result: "wrong",
      timingOffset,
    }
  }

  return {
    playedNote,
    expectedNote: null,
    result: "extra",
    timingOffset: 0,
  }
}

/**
 * Calculate timing score for a note based on offset.
 * Pure function with no Effect dependencies.
 *
 * @param offsetMs - Timing offset in milliseconds
 * @param graceMs - Grace period for perfect timing (default 75ms)
 * @param toleranceMs - Tolerance for "correct" timing (default 150ms)
 * @returns Score from 0 to 1
 */
export function calculateTimingScore(
  offsetMs: number,
  graceMs = 75,
  toleranceMs = 150
): number {
  const absOffset = Math.abs(offsetMs)

  if (absOffset <= graceMs) {
    return 1.0 // Perfect timing
  }

  if (absOffset <= toleranceMs) {
    // Linear falloff from grace to tolerance
    const range = toleranceMs - graceMs
    const distance = absOffset - graceMs
    return 1.0 - distance / range
  }

  // Outside tolerance - exponential falloff for partial credit
  const beyondTolerance = absOffset - toleranceMs
  return Math.max(0, Math.exp(-beyondTolerance / 200) * 0.5)
}
