import { Effect } from "effect"
import { makeAtom, type Atom } from "./Atom.js"
import type { NoteResult, SessionComplete, SessionStarted } from "@etude/shared"

/**
 * Session state type representing the current session.
 */
export interface SessionState {
  sessionId: string
  pieceId: string
  expectedNoteCount: number
  playedNoteCount: number
  matchedCount: number
  measureRange: readonly [number, number]
  hand: "left" | "right" | "both"
  tempo: number
}

/**
 * Note result from real-time feedback.
 */
export interface NoteResultState {
  pitch: number
  result: "correct" | "wrong" | "extra"
  timingOffset: number
}

/**
 * Session results after ending.
 */
export interface SessionResultsState {
  attemptId: string
  noteAccuracy: number
  timingAccuracy: number
  combinedScore: number
  leftHandAccuracy: number | null
  rightHandAccuracy: number | null
  extraNotes: number
  missedNotes: readonly unknown[]
}

/**
 * Session atoms for reactive state management.
 */
export interface SessionAtoms {
  isActive: Atom<boolean>
  sessionState: Atom<SessionState | null>
  lastNoteResult: Atom<NoteResultState | null>
  results: Atom<SessionResultsState | null>
  isLoading: Atom<boolean>
  error: Atom<string | null>
}

/**
 * Create session atoms.
 * Should be called once during app initialization.
 */
export const makeSessionAtoms = Effect.gen(function* () {
  const isActive = yield* makeAtom(false)
  const sessionState = yield* makeAtom<SessionState | null>(null)
  const lastNoteResult = yield* makeAtom<NoteResultState | null>(null)
  const results = yield* makeAtom<SessionResultsState | null>(null)
  const isLoading = yield* makeAtom(false)
  const error = yield* makeAtom<string | null>(null)

  return {
    isActive,
    sessionState,
    lastNoteResult,
    results,
    isLoading,
    error,
  }
})

/**
 * Convert RPC SessionStarted to session state.
 */
export function sessionStartedToState(
  started: SessionStarted,
  pieceId: string,
  hand: "left" | "right" | "both",
  tempo: number
): SessionState {
  return {
    sessionId: started.sessionId,
    pieceId,
    expectedNoteCount: started.expectedNoteCount,
    playedNoteCount: 0,
    matchedCount: 0,
    measureRange: started.measureRange,
    hand,
    tempo,
  }
}

/**
 * Convert RPC SessionComplete to results state.
 */
export function sessionCompleteToResults(
  complete: SessionComplete
): SessionResultsState {
  return {
    attemptId: complete.attemptId,
    noteAccuracy: complete.noteAccuracy,
    timingAccuracy: complete.timingAccuracy,
    combinedScore: complete.combinedScore,
    leftHandAccuracy: complete.leftHandAccuracy._tag === "Some" ? complete.leftHandAccuracy.value : null,
    rightHandAccuracy: complete.rightHandAccuracy._tag === "Some" ? complete.rightHandAccuracy.value : null,
    extraNotes: complete.extraNotes,
    missedNotes: complete.missedNotes,
  }
}

/**
 * Convert RPC NoteResult to note result state.
 */
export function noteResultToState(result: NoteResult): NoteResultState {
  return {
    pitch: result.pitch,
    result: result.result,
    timingOffset: result.timingOffset,
  }
}
