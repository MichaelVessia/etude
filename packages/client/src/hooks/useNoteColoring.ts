import { useCallback, useRef } from "react"
import type { NoteElementInfo } from "./useVerovio.js"
import type { NoteSubmitResult } from "./useSession.js"

// Timing thresholds in milliseconds (matching server)
const TIMING_TOLERANCE_MS = 150 // green threshold
const TIMING_LATE_MS = 300 // yellow threshold

export type NoteColorState = "correct" | "late" | "wrong" | "missed" | "pending"

export interface NoteColorInfo {
  elementId: string
  state: NoteColorState
}

// CSS colors for each state
const NOTE_COLORS: Record<NoteColorState, string> = {
  correct: "#16a34a", // green
  late: "#ca8a04", // yellow/orange
  wrong: "#dc2626", // red
  missed: "#9ca3af", // gray
  pending: "#000000", // black (default)
}

export interface UseNoteColoringResult {
  // Initialize the note map when sheet music loads
  initializeNoteMap: (noteElements: NoteElementInfo[]) => void
  // Process a note result from the server
  processNoteResult: (result: NoteSubmitResult) => void
  // Mark notes as missed when playhead passes them
  markMissedNotes: (currentTime: number) => void
  // Reset all notes to pending state
  resetColors: () => void
  // Get current color state for debugging
  getNoteStates: () => Map<string, NoteColorInfo>
}

export function useNoteColoring(): UseNoteColoringResult {
  // Map from composite key "pitch-onset" to element info
  const noteMapRef = useRef<Map<string, NoteElementInfo>>(new Map())
  // Map from elementId to current color state
  const colorStateRef = useRef<Map<string, NoteColorInfo>>(new Map())

  // Helper to create lookup key
  const makeKey = (pitch: number, onset: number): string => {
    // Round onset to nearest 10ms to handle small timing variations
    const roundedOnset = Math.round(onset / 10) * 10
    return `${pitch}-${roundedOnset}`
  }

  // Apply color to a note element in the SVG
  const applyColor = useCallback((elementId: string, state: NoteColorState) => {
    const color = NOTE_COLORS[state]

    // Find the note element by ID
    const noteElement = document.getElementById(elementId)
    if (!noteElement) return

    // Find and color the notehead (usually a path or use element inside)
    const notehead = noteElement.querySelector('.notehead, use, path')
    if (notehead) {
      ;(notehead as SVGElement).style.fill = color
    }

    // Also color the stem if present
    const stem = noteElement.querySelector('.stem')
    if (stem) {
      ;(stem as SVGElement).style.stroke = color
    }

    // Update our state tracking
    colorStateRef.current.set(elementId, { elementId, state })
  }, [])

  // Initialize the note map from Verovio element info
  const initializeNoteMap = useCallback((noteElements: NoteElementInfo[]) => {
    noteMapRef.current.clear()
    colorStateRef.current.clear()

    for (const note of noteElements) {
      const key = makeKey(note.pitch, note.onset)
      noteMapRef.current.set(key, note)
      // Initialize as pending
      colorStateRef.current.set(note.elementId, {
        elementId: note.elementId,
        state: "pending",
      })
    }
  }, [])

  // Process a note result from the server
  const processNoteResult = useCallback((result: NoteSubmitResult) => {
    if (result.expectedNoteTime === null) {
      // Extra note - no visual feedback on staff per spec
      return
    }

    // Determine color based on result and timing
    let state: NoteColorState
    if (result.result === "wrong") {
      state = "wrong"
    } else if (result.result === "correct") {
      const absOffset = Math.abs(result.timingOffset)
      if (absOffset <= TIMING_TOLERANCE_MS) {
        state = "correct"
      } else if (absOffset <= TIMING_LATE_MS) {
        state = "late"
      } else {
        state = "wrong" // Correct pitch but way off timing
      }
    } else {
      // "extra" - no visual feedback
      return
    }

    // Find the element by pitch and original time
    const key = makeKey(result.pitch, result.expectedNoteTime)
    const noteInfo = noteMapRef.current.get(key)

    if (noteInfo) {
      applyColor(noteInfo.elementId, state)
    } else {
      // Try nearby times (±20ms) in case of rounding differences
      for (const [k, info] of noteMapRef.current) {
        const [p, t] = k.split("-").map(Number)
        if (p === result.pitch && Math.abs(t! - result.expectedNoteTime) <= 20) {
          applyColor(info.elementId, state)
          break
        }
      }
    }
  }, [applyColor])

  // Mark notes as missed when playhead passes them
  const markMissedNotes = useCallback((currentTime: number) => {
    for (const [_key, noteInfo] of noteMapRef.current) {
      const currentState = colorStateRef.current.get(noteInfo.elementId)
      // Only mark as missed if still pending and time has passed
      if (currentState?.state === "pending" && noteInfo.onset < currentTime) {
        applyColor(noteInfo.elementId, "missed")
      }
    }
  }, [applyColor])

  // Reset all notes to pending (black)
  const resetColors = useCallback(() => {
    for (const [elementId] of colorStateRef.current) {
      applyColor(elementId, "pending")
    }
  }, [applyColor])

  // Get current states for debugging
  const getNoteStates = useCallback(() => {
    return new Map(colorStateRef.current)
  }, [])

  return {
    initializeNoteMap,
    processNoteResult,
    markMissedNotes,
    resetColors,
    getNoteStates,
  }
}
