import { Effect, Layer } from "effect"
import {
  NoteEvent,
  PlayedNote,
  Hand,
  matchNote as sharedMatchNote,
  calculateTimingScore,
  DEFAULT_CONFIG,
} from "@etude/shared"

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

// Wrapper function to adapt shared matchNote to local MatchResult interface
function matchNotePure(
  playedNote: PlayedNote,
  expectedNotes: NoteEvent[],
  matchedIndices: Set<number>,
  hand: Hand
): MatchResult {
  const result = sharedMatchNote(playedNote, expectedNotes, matchedIndices, hand, DEFAULT_CONFIG)
  return {
    playedNote: result.playedNote as PlayedNote,
    expectedNote: result.expectedNote,
    result: result.result,
    timingOffset: result.timingOffset,
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
