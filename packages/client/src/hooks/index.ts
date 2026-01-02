export { useMidi } from "./useMidi.js"
export type { MidiDevice, MidiNoteEvent, UseMidiResult } from "./useMidi.js"

export { useVerovio } from "./useVerovio.js"
export type { VerovioOptions, UseVerovioResult, NoteElementInfo } from "./useVerovio.js"

export { useAudio } from "./useAudio.js"
export type { NoteToPlay, UseAudioResult } from "./useAudio.js"

export { useSession } from "./useSession.js"
export type {
  Hand,
  SessionStartParams,
  SessionStartResult,
  NoteSubmitResult,
  SessionEndResult,
  SessionState,
  UseSessionResult,
} from "./useSession.js"

export { useNoteColoring } from "./useNoteColoring.js"
export type { NoteColorState, NoteColorInfo, UseNoteColoringResult } from "./useNoteColoring.js"

export { usePlayhead } from "./usePlayhead.js"
export type { PlayheadPosition, UsePlayheadResult } from "./usePlayhead.js"

export { usePiece } from "./usePiece.js"
export type { StoredPiece, UsePieceResult } from "./usePiece.js"

export { useExtraNotes } from "./usePlayedNotes.js"
export type { ExtraNoteIndicator, StaffBounds, UseExtraNotesResult } from "./usePlayedNotes.js"
