import { Effect, Layer } from "effect"
import { NoteEvent, PlayedNote, Hand } from "@etude/shared"

// Configuration constants
const TIMING_TOLERANCE_MS = 150
const TIMING_GRACE_MS = 75

export type MatchResultType = "correct" | "wrong" | "extra"

export interface MatchResult {
  playedNote: PlayedNote
  expectedNote: NoteEvent | null
  result: MatchResultType
  timingOffset: number // ms from expected (negative = early)
}

export interface ComparisonResult {
  matchResults: MatchResult[]
  noteAccuracy: number
  timingAccuracy: number
  combinedScore: number
  missedNotes: NoteEvent[]
  extraNotes: number
  leftHandAccuracy: number | null
  rightHandAccuracy: number | null
}

export class ComparisonService extends Effect.Tag("ComparisonService")<
  ComparisonService,
  {
    readonly compare: (
      expectedNotes: NoteEvent[],
      playedNotes: PlayedNote[],
      hand: Hand,
      noteWeight?: number,
      timingWeight?: number
    ) => Effect.Effect<ComparisonResult>

    readonly matchNote: (
      playedNote: PlayedNote,
      expectedNotes: NoteEvent[],
      matchedIndices: Set<number>,
      hand: Hand
    ) => Effect.Effect<MatchResult>
  }
>() {}

// Calculate timing score for a note
function calculateTimingScore(offsetMs: number): number {
  const absOffset = Math.abs(offsetMs)
  if (absOffset <= TIMING_GRACE_MS) {
    return 1.0 // Perfect timing
  }
  if (absOffset <= TIMING_TOLERANCE_MS) {
    // Linear falloff from grace to tolerance
    const range = TIMING_TOLERANCE_MS - TIMING_GRACE_MS
    const distance = absOffset - TIMING_GRACE_MS
    return 1.0 - distance / range
  }
  // Outside tolerance - still some partial credit
  // Exponential falloff beyond tolerance
  const beyondTolerance = absOffset - TIMING_TOLERANCE_MS
  return Math.max(0, Math.exp(-beyondTolerance / 200) * 0.5)
}

// Pure function to match a single note
function matchNotePure(
  playedNote: PlayedNote,
  expectedNotes: NoteEvent[],
  matchedIndices: Set<number>,
  hand: Hand
): MatchResult {
  // Filter expected notes by hand (if not "both")
  const eligibleNotes = expectedNotes
    .map((note, index) => ({ note, index }))
    .filter(({ note, index }) => {
      // Don't match already matched notes
      if (matchedIndices.has(index)) return false
      // Filter by hand if not "both"
      if (hand !== "both" && note.hand !== hand) return false
      return true
    })

  if (eligibleNotes.length === 0) {
    // No eligible notes - this is an extra note
    return {
      playedNote,
      expectedNote: null,
      result: "extra" as const,
      timingOffset: 0,
    }
  }

  // Find the closest unmatched note with the same pitch (greedy matching)
  let bestMatch: { note: NoteEvent; index: number } | null = null
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
    // Found a matching pitch
    const timingOffset = playedNote.timestamp - bestMatch.note.startTime
    matchedIndices.add(bestMatch.index)

    // Check if within tolerance for correct
    const absOffset = Math.abs(timingOffset)
    const isCorrect = absOffset <= TIMING_TOLERANCE_MS * 2 // More lenient for "correct"

    return {
      playedNote,
      expectedNote: bestMatch.note,
      result: isCorrect ? ("correct" as const) : ("wrong" as const),
      timingOffset,
    }
  }

  // No matching pitch found - this is a wrong note
  // Find the closest expected note by time to provide timing offset
  let closestByTime: { note: NoteEvent; index: number } | null = null
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
      result: "wrong" as const,
      timingOffset,
    }
  }

  return {
    playedNote,
    expectedNote: null,
    result: "extra" as const,
    timingOffset: 0,
  }
}

export const ComparisonServiceLive = Layer.succeed(
  ComparisonService,
  ComparisonService.of({
    matchNote: (
      playedNote: PlayedNote,
      expectedNotes: NoteEvent[],
      matchedIndices: Set<number>,
      hand: Hand
    ) => Effect.succeed(matchNotePure(playedNote, expectedNotes, matchedIndices, hand)),

    compare: (
      expectedNotes: NoteEvent[],
      playedNotes: PlayedNote[],
      hand: Hand,
      noteWeight = 0.6,
      timingWeight = 0.4
    ) =>
      Effect.sync(() => {
        const matchedIndices = new Set<number>()
        const matchResults: MatchResult[] = []

        // Match each played note
        for (const playedNote of playedNotes) {
          const result = matchNotePure(
            playedNote,
            expectedNotes,
            matchedIndices,
            hand
          )
          matchResults.push(result)
        }

        // Calculate metrics
        const filteredExpected =
          hand === "both"
            ? expectedNotes
            : expectedNotes.filter((n) => n.hand === hand)

        const totalExpected = filteredExpected.length

        const correctNotes = matchResults.filter(
          (r) => r.result === "correct"
        ).length
        const extraNotes = matchResults.filter(
          (r) => r.result === "extra"
        ).length

        // Find missed notes (expected but not matched)
        const missedNotes = filteredExpected.filter((_n, idx) => {
          const originalIndex = expectedNotes.findIndex(
            (en) => en === filteredExpected[idx]
          )
          return !matchedIndices.has(originalIndex)
        })

        // Note accuracy: correct / total expected
        const noteAccuracy =
          totalExpected > 0 ? correctNotes / totalExpected : 0

        // Timing accuracy: average timing score for correct notes
        const correctResults = matchResults.filter(
          (r) => r.result === "correct"
        )
        const timingScores = correctResults.map((r) =>
          calculateTimingScore(r.timingOffset)
        )
        const timingAccuracy =
          timingScores.length > 0
            ? timingScores.reduce((a, b) => a + b, 0) / totalExpected
            : 0

        // Combined score
        const combinedScore =
          (noteWeight * noteAccuracy + timingWeight * timingAccuracy) * 100

        // Per-hand accuracy (when practicing both hands)
        let leftHandAccuracy: number | null = null
        let rightHandAccuracy: number | null = null

        if (hand === "both") {
          const leftExpected = expectedNotes.filter((n) => n.hand === "left")
          const rightExpected = expectedNotes.filter(
            (n) => n.hand === "right"
          )

          const leftCorrect = matchResults.filter(
            (r) =>
              r.result === "correct" && r.expectedNote?.hand === "left"
          ).length
          const rightCorrect = matchResults.filter(
            (r) =>
              r.result === "correct" && r.expectedNote?.hand === "right"
          ).length

          leftHandAccuracy =
            leftExpected.length > 0
              ? leftCorrect / leftExpected.length
              : null
          rightHandAccuracy =
            rightExpected.length > 0
              ? rightCorrect / rightExpected.length
              : null
        }

        return {
          matchResults,
          noteAccuracy,
          timingAccuracy,
          combinedScore,
          missedNotes,
          extraNotes,
          leftHandAccuracy,
          rightHandAccuracy,
        }
      }),
  })
)
