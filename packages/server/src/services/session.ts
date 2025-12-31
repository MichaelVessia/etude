import { Effect, Layer, Ref, Option } from "effect"
import { SqlError } from "@effect/sql"
import {
  NoteEvent,
  PlayedNote,
  PieceId,
  Hand,
  Milliseconds,
  MidiPitch,
  Velocity,
  AttemptId,
} from "@etude/shared"
import { SessionError, PieceNotFound } from "@etude/shared"
import { PieceRepo } from "../repos/piece-repo.js"
import { AttemptRepo } from "../repos/attempt-repo.js"
import { ComparisonService } from "./comparison.js"
import type { MatchResult } from "./comparison.js"

export interface SessionState {
  sessionId: string
  pieceId: PieceId
  expectedNotes: NoteEvent[]
  matchedIndices: Set<number>
  playedNotes: PlayedNote[]
  matchResults: MatchResult[]
  measureStart: number
  measureEnd: number
  hand: Hand
  tempo: number
  startTime: number // timestamp when session started
}

export interface SessionStartResult {
  sessionId: string
  expectedNoteCount: number
  measureRange: [number, number]
}

export interface NoteSubmitResult {
  pitch: number
  result: "correct" | "wrong" | "extra"
  timingOffset: number
}

export interface SessionEndResult {
  attemptId: AttemptId
  noteAccuracy: number
  timingAccuracy: number
  combinedScore: number
  leftHandAccuracy: number | null
  rightHandAccuracy: number | null
  extraNotes: number
  missedNotes: NoteEvent[]
}

export class SessionService extends Effect.Tag("SessionService")<
  SessionService,
  {
    readonly startSession: (
      pieceId: PieceId,
      measureStart: number,
      measureEnd: number,
      hand: Hand,
      tempo: number
    ) => Effect.Effect<SessionStartResult, SessionError | PieceNotFound | SqlError.SqlError>

    readonly submitNote: (
      pitch: number,
      velocity: number,
      timestamp: number,
      on: boolean
    ) => Effect.Effect<NoteSubmitResult, SessionError>

    readonly endSession: () => Effect.Effect<SessionEndResult, SessionError | SqlError.SqlError>

    readonly getState: () => Effect.Effect<SessionState | null>
  }
>() {}

// Filter notes by measure range
function filterNotesByMeasures(
  notes: NoteEvent[],
  measureStart: number,
  measureEnd: number
): NoteEvent[] {
  return notes.filter(
    (n) => n.measure >= measureStart && n.measure <= measureEnd
  )
}

// Adjust note timing relative to measure start
// tempo is a percentage: 100 = normal speed, 50 = half speed, 200 = double speed
function adjustNoteTiming(
  notes: NoteEvent[],
  measureStart: number,
  tempo: number
): NoteEvent[] {
  // Find the start time of the first note in the range
  const firstNote = notes.find((n) => n.measure >= measureStart)
  const baseTime = firstNote?.startTime ?? 0

  // Tempo ratio: at 50% speed notes take 2x as long (100/50=2)
  const tempoRatio = 100 / tempo

  return notes.map(
    (n) =>
      new NoteEvent({
        pitch: n.pitch,
        startTime: ((n.startTime - baseTime) * tempoRatio) as Milliseconds,
        duration: (n.duration * tempoRatio) as Milliseconds,
        measure: n.measure,
        hand: n.hand,
        voice: n.voice ?? Option.none(),
      })
  )
}

export const SessionServiceLive = Layer.effect(
  SessionService,
  Effect.gen(function* () {
    // Session state stored in a Ref
    const sessionRef = yield* Ref.make<SessionState | null>(null)
    const pieceRepo = yield* PieceRepo
    const attemptRepo = yield* AttemptRepo
    const comparisonService = yield* ComparisonService

    return {
      startSession: (
        pieceId: PieceId,
        measureStart: number,
        measureEnd: number,
        hand: Hand,
        tempo: number
      ) =>
        Effect.gen(function* () {
          // Check if session already active
          const current = yield* Ref.get(sessionRef)
          if (current !== null) {
            return yield* new SessionError({ reason: "AlreadyActive" })
          }

          // Get piece notes (getById validates piece exists)
          yield* pieceRepo.getById(pieceId)
          const allNotes = yield* pieceRepo.getNotes(pieceId)

          // Filter and adjust notes for this session
          const filteredNotes = filterNotesByMeasures(
            allNotes,
            measureStart,
            measureEnd
          )

          // Filter by hand if not "both"
          const handFilteredNotes =
            hand === "both"
              ? filteredNotes
              : filteredNotes.filter((n) => n.hand === hand)

          // Adjust timing relative to session start
          const adjustedNotes = adjustNoteTiming(
            handFilteredNotes,
            measureStart,
            tempo
          )

          const sessionId = crypto.randomUUID()

          const state: SessionState = {
            sessionId,
            pieceId,
            expectedNotes: adjustedNotes,
            matchedIndices: new Set(),
            playedNotes: [],
            matchResults: [],
            measureStart,
            measureEnd,
            hand,
            tempo,
            startTime: Date.now(),
          }

          yield* Ref.set(sessionRef, state)

          return {
            sessionId,
            expectedNoteCount: adjustedNotes.length,
            measureRange: [measureStart, measureEnd] as [number, number],
          }
        }),

      submitNote: (
        pitch: number,
        velocity: number,
        timestamp: number,
        on: boolean
      ) =>
        Effect.gen(function* () {
          const state = yield* Ref.get(sessionRef)
          if (state === null) {
            return yield* new SessionError({ reason: "NotStarted" })
          }

          // Only process note-on events for now
          if (!on) {
            // Just return a placeholder for note-off
            return {
              pitch,
              result: "extra" as const,
              timingOffset: 0,
            }
          }

          const playedNote = new PlayedNote({
            pitch: pitch as MidiPitch,
            timestamp: timestamp as Milliseconds,
            velocity: velocity as Velocity,
            duration: Option.none(),
          })

          // Match this note against expected notes
          const result = yield* comparisonService.matchNote(
            playedNote,
            state.expectedNotes,
            state.matchedIndices,
            state.hand
          )

          // Update state
          yield* Ref.update(sessionRef, (s) => {
            if (s === null) return null
            return {
              ...s,
              playedNotes: [...s.playedNotes, playedNote],
              matchResults: [...s.matchResults, result],
            }
          })

          return {
            pitch,
            result: result.result,
            timingOffset: result.timingOffset,
          }
        }),

      endSession: () =>
        Effect.gen(function* () {
          const state = yield* Ref.get(sessionRef)
          if (state === null) {
            return yield* new SessionError({ reason: "NotStarted" })
          }

          // Calculate final scores using comparison service
          const comparisonResult = yield* comparisonService.compare(
            state.expectedNotes,
            state.playedNotes,
            state.hand
          )

          // Save attempt to database
          const attempt = yield* attemptRepo.create({
            pieceId: state.pieceId,
            measureStart: state.measureStart,
            measureEnd: state.measureEnd,
            hand: state.hand,
            tempo: state.tempo,
            noteAccuracy: comparisonResult.noteAccuracy,
            timingAccuracy: comparisonResult.timingAccuracy,
            combinedScore: comparisonResult.combinedScore,
          })

          // Clear session state
          yield* Ref.set(sessionRef, null)

          return {
            attemptId: attempt.id,
            noteAccuracy: comparisonResult.noteAccuracy,
            timingAccuracy: comparisonResult.timingAccuracy,
            combinedScore: comparisonResult.combinedScore,
            leftHandAccuracy: comparisonResult.leftHandAccuracy,
            rightHandAccuracy: comparisonResult.rightHandAccuracy,
            extraNotes: comparisonResult.extraNotes,
            missedNotes: comparisonResult.missedNotes,
          }
        }),

      getState: () => Ref.get(sessionRef),
    }
  })
)
