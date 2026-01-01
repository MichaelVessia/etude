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
  expectedNotes: NoteEvent[] // tempo-adjusted notes for matching
  originalNotes: NoteEvent[] // original notes for UI mapping (piece time)
  matchedIndices: Set<number>
  playedNotes: PlayedNote[]
  matchResults: MatchResult[]
  measureStart: number
  measureEnd: number
  hand: Hand
  tempo: number
  startTime: number // timestamp when session started
  firstNoteOffset: number | null // offset to align played notes with expected notes
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
  expectedNoteTime: number | null // original startTime from piece start (for Verovio UI mapping)
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

// Convert serialized Option from JSON back to actual Option
function deserializeOption<T>(value: unknown): Option.Option<T> {
  if (value === null || value === undefined) {
    return Option.none()
  }
  // Check if it's a serialized Option from JSON
  if (typeof value === "object" && value !== null && "_tag" in value) {
    const obj = value as { _tag: string; value?: T }
    if (obj._tag === "None") {
      return Option.none()
    }
    if (obj._tag === "Some" && "value" in obj) {
      return Option.some(obj.value as T)
    }
  }
  // If it's already an Option instance, return as-is
  if (Option.isOption(value)) {
    return value as Option.Option<T>
  }
  // Otherwise treat as a raw value
  return Option.some(value as T)
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
        voice: deserializeOption<number>(n.voice),
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
            originalNotes: handFilteredNotes, // preserve original times for UI mapping
            matchedIndices: new Set(),
            playedNotes: [],
            matchResults: [],
            measureStart,
            measureEnd,
            hand,
            tempo,
            startTime: Date.now(),
            firstNoteOffset: null,
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
              expectedNoteTime: null,
            }
          }

          // Calculate timing offset on first note to align with expected notes
          // This allows the user to start playing whenever they're ready
          let firstNoteOffset = state.firstNoteOffset
          if (firstNoteOffset === null && state.expectedNotes.length > 0) {
            // Align to the first expected note (time 0)
            // This means: when user plays first note, that becomes time 0
            firstNoteOffset = timestamp
            yield* Effect.logDebug(`First note played at ${timestamp}ms, setting offset to ${firstNoteOffset}`)
            yield* Ref.update(sessionRef, (s) =>
              s ? { ...s, firstNoteOffset } : null
            )
          }

          // Adjust timestamp by the offset so played notes align with expected
          const adjustedTimestamp = timestamp - (firstNoteOffset ?? 0)
          yield* Effect.logDebug(`Note pitch=${pitch} timestamp=${timestamp} adjusted=${adjustedTimestamp} offset=${firstNoteOffset}`)

          const playedNote = new PlayedNote({
            pitch: pitch as MidiPitch,
            timestamp: adjustedTimestamp as Milliseconds,
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

          // Look up original note time for UI mapping
          // Find the index of the matched note in expectedNotes, then get original time
          let originalNoteTime: number | null = null
          if (result.expectedNote) {
            const matchedIndex = state.expectedNotes.findIndex(
              (n) => n === result.expectedNote
            )
            if (matchedIndex >= 0 && matchedIndex < state.originalNotes.length) {
              originalNoteTime = state.originalNotes[matchedIndex]!.startTime
            }
          }

          return {
            pitch,
            result: result.result,
            timingOffset: result.timingOffset,
            expectedNoteTime: originalNoteTime,
          }
        }),

      endSession: () =>
        Effect.gen(function* () {
          const state = yield* Ref.get(sessionRef)
          if (state === null) {
            return yield* new SessionError({ reason: "NotStarted" })
          }

          yield* Effect.logDebug(`End session - expected notes: ${JSON.stringify(state.expectedNotes.map(n => ({ pitch: n.pitch, time: n.startTime })))}`)
          yield* Effect.logDebug(`End session - played notes: ${JSON.stringify(state.playedNotes.map(n => ({ pitch: n.pitch, time: n.timestamp })))}`)
          yield* Effect.logDebug(`End session - firstNoteOffset: ${state.firstNoteOffset}`)

          // Calculate final scores using comparison service
          const comparisonResult = yield* comparisonService.compare(
            state.expectedNotes,
            state.playedNotes,
            state.hand
          )
          yield* Effect.logDebug(`Comparison result: noteAcc=${comparisonResult.noteAccuracy} timingAcc=${comparisonResult.timingAccuracy} combined=${comparisonResult.combinedScore}`)

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
