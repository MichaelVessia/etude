import { useCallback, useMemo, useRef } from "react"
import { wallTimeToPieceTime } from "@etude/shared"
import type { NoteElementInfo } from "./useVerovio.js"
import type { NoteSubmitResult } from "./useSession.js"

export type NoteColorState = "correct" | "wrong" | "missed" | "pending"

export interface NoteColorInfo {
  elementId: string
  state: NoteColorState
}

// CSS colors for each state
const NOTE_COLORS: Record<NoteColorState, string> = {
  correct: "#16a34a", // green
  wrong: "#dc2626", // red
  missed: "#9ca3af", // gray
  pending: "#000000", // black (default)
}

export interface UseNoteColoringResult {
  initializeNoteMap: (noteElements: NoteElementInfo[]) => void
  processNoteResult: (result: NoteSubmitResult) => void
  /**
   * Mark notes as missed when the playhead passes them.
   * @param currentTime - Current playhead position in piece time (ms)
   * @param tempoPercent - Current tempo percentage (100 = normal, 50 = half speed)
   */
  markMissedNotes: (currentTime: number, tempoPercent: number) => void
  resetColors: () => void
  getNoteStates: () => Map<string, NoteColorInfo>
  /** Re-apply all colors to the DOM (call after SVG re-renders) */
  reapplyColors: () => void
}

export function useNoteColoring(): UseNoteColoringResult {
  // Map from pitch to array of note elements (in onset order)
  const pitchToNotesRef = useRef<Map<number, NoteElementInfo[]>>(new Map())
  // All notes sorted by onset (for missed note detection)
  const allNotesRef = useRef<NoteElementInfo[]>([])
  // Track colored state by elementId
  const colorStateRef = useRef<Map<string, NoteColorInfo>>(new Map())

  // Apply color to DOM element (doesn't update state)
  const applyColorToDOM = useCallback((elementId: string, color: string) => {
    const noteElement = document.getElementById(elementId)
    if (!noteElement) return false

    // Verovio structure: <g class="note"> contains <use> for note head
    // Target only <use> elements (note heads) - not <rect> (stems) or other elements
    const useElements = noteElement.querySelectorAll('use')

    useElements.forEach((use) => {
      // Skip accidentals (they have class="accid" parent)
      if (use.closest('.accid')) return

      // Set attributes directly for SVG use elements
      use.setAttribute('fill', color)
      use.setAttribute('stroke', color)
    })

    return true
  }, [])

  // Apply color to note head and update state
  const applyColor = useCallback((elementId: string, state: NoteColorState) => {
    const color = NOTE_COLORS[state]
    applyColorToDOM(elementId, color)
    colorStateRef.current.set(elementId, { elementId, state })
  }, [applyColorToDOM])

  // Re-apply all colors to DOM (call after SVG re-renders)
  const reapplyColors = useCallback(() => {
    for (const [elementId, info] of colorStateRef.current) {
      // Only apply non-pending colors
      if (info.state !== "pending") {
        applyColorToDOM(elementId, NOTE_COLORS[info.state])
      }
    }
  }, [applyColorToDOM])

  // Initialize note maps from Verovio elements
  const initializeNoteMap = useCallback((noteElements: NoteElementInfo[]) => {
    pitchToNotesRef.current.clear()
    colorStateRef.current.clear()

    // Sort notes by onset time
    const sortedNotes = [...noteElements].sort((a, b) => a.onset - b.onset)
    allNotesRef.current = sortedNotes

    // Group by pitch, maintaining onset order
    for (const note of sortedNotes) {
      if (!pitchToNotesRef.current.has(note.pitch)) {
        pitchToNotesRef.current.set(note.pitch, [])
      }
      pitchToNotesRef.current.get(note.pitch)?.push(note)

      // Initialize as pending
      colorStateRef.current.set(note.elementId, {
        elementId: note.elementId,
        state: "pending",
      })
    }
  }, [])

  // Process a note result from the server
  const processNoteResult = useCallback((result: NoteSubmitResult) => {
    // Skip extra notes (no visual feedback on staff)
    if (result.result === "extra") return

    // Trust server result directly
    const state: NoteColorState = result.result === "correct" ? "correct" : "wrong"

    // Find the note with matching pitch closest to expected time
    const notesForPitch = pitchToNotesRef.current.get(result.pitch)
    if (!notesForPitch || notesForPitch.length === 0) return

    // Use time-based matching: find uncolored note closest to expectedNoteTime
    const expectedTime = result.expectedNoteTime ?? 0

    // Filter to only pending (uncolored) notes
    const pendingNotes = notesForPitch.filter(note => {
      const currentState = colorStateRef.current.get(note.elementId)
      return currentState?.state === "pending"
    })

    if (pendingNotes.length === 0) return

    // Find the note closest to the expected time
    let noteToColor = pendingNotes[0]
    let minDiff = Math.abs(noteToColor.onset - expectedTime)

    for (const note of pendingNotes) {
      const diff = Math.abs(note.onset - expectedTime)
      if (diff < minDiff) {
        minDiff = diff
        noteToColor = note
      }
    }

    applyColor(noteToColor.elementId, state)
  }, [applyColor])

  // Mark notes as missed when playhead passes them
  const markMissedNotes = useCallback((currentTime: number, tempoPercent: number) => {
    const graceWallMs = 300 // Grace period in wall-clock time (consistent UX)
    // Convert grace period to piece time based on tempo
    // At 50% tempo: 300ms wall = 150ms piece time (slower playhead, shorter piece-time grace)
    // At 150% tempo: 300ms wall = 450ms piece time (faster playhead, longer piece-time grace)
    const gracePieceMs = wallTimeToPieceTime(graceWallMs, tempoPercent)

    for (const note of allNotesRef.current) {
      const currentState = colorStateRef.current.get(note.elementId)
      // Only mark as missed if still pending and time + grace has passed
      if (currentState?.state === "pending" && note.onset + gracePieceMs < currentTime) {
        applyColor(note.elementId, "missed")
      }
    }
  }, [applyColor])

  // Reset all notes to pending (black)
  const resetColors = useCallback(() => {
    // Reset visual colors and state to pending
    for (const [elementId] of colorStateRef.current) {
      applyColor(elementId, "pending")
    }
  }, [applyColor])

  // Get current states for debugging
  const getNoteStates = useCallback(() => {
    return new Map(colorStateRef.current)
  }, [])

  return useMemo(() => ({
    initializeNoteMap,
    processNoteResult,
    markMissedNotes,
    resetColors,
    getNoteStates,
    reapplyColors,
  }), [initializeNoteMap, processNoteResult, markMissedNotes, resetColors, getNoteStates, reapplyColors])
}
