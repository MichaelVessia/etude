import { useCallback, useMemo, useRef } from "react"
import type { NoteElementInfo } from "./useVerovio.js"
import type { NoteSubmitResult } from "./useSession.js"

// Timing threshold in milliseconds
const TIMING_TOLERANCE_MS = 150

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
  markMissedNotes: (currentTime: number) => void
  resetColors: () => void
  getNoteStates: () => Map<string, NoteColorInfo>
}

export function useNoteColoring(): UseNoteColoringResult {
  // Map from pitch to array of note elements (in onset order)
  const pitchToNotesRef = useRef<Map<number, NoteElementInfo[]>>(new Map())
  // Track next uncolored index for each pitch
  const pitchNextIndexRef = useRef<Map<number, number>>(new Map())
  // All notes sorted by onset (for missed note detection)
  const allNotesRef = useRef<NoteElementInfo[]>([])
  // Track colored state by elementId
  const colorStateRef = useRef<Map<string, NoteColorInfo>>(new Map())

  // Apply color to note head only (not stems or flags)
  const applyColor = useCallback((elementId: string, state: NoteColorState) => {
    const color = NOTE_COLORS[state]

    const noteElement = document.getElementById(elementId)
    if (!noteElement) {
      return
    }

    // Verovio structure: <g class="note"> contains <use> for note head
    // Target only <use> elements (note heads) - not <rect> (stems) or other elements
    const useElements = noteElement.querySelectorAll('use')
    useElements.forEach((use) => {
      // Skip accidentals (they have class="accid" parent)
      if (use.closest('.accid')) return

      const svgUse = use as SVGUseElement
      if (svgUse.style) {
        svgUse.style.fill = color
        svgUse.style.stroke = color
      }
    })

    colorStateRef.current.set(elementId, { elementId, state })
  }, [])

  // Initialize note maps from Verovio elements
  const initializeNoteMap = useCallback((noteElements: NoteElementInfo[]) => {
    pitchToNotesRef.current.clear()
    pitchNextIndexRef.current.clear()
    colorStateRef.current.clear()

    // Sort notes by onset time
    const sortedNotes = [...noteElements].sort((a, b) => a.onset - b.onset)
    allNotesRef.current = sortedNotes

    // Group by pitch, maintaining onset order
    for (const note of sortedNotes) {
      if (!pitchToNotesRef.current.has(note.pitch)) {
        pitchToNotesRef.current.set(note.pitch, [])
        pitchNextIndexRef.current.set(note.pitch, 0)
      }
      pitchToNotesRef.current.get(note.pitch)!.push(note)

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
    if (result.result === "extra") {
      return
    }

    // Determine color based on result
    let state: NoteColorState
    if (result.result === "correct") {
      const absOffset = Math.abs(result.timingOffset)
      state = absOffset <= TIMING_TOLERANCE_MS ? "correct" : "wrong"
    } else {
      state = "wrong"
    }

    // Find the next uncolored note with this pitch
    const notesForPitch = pitchToNotesRef.current.get(result.pitch)
    if (!notesForPitch || notesForPitch.length === 0) {
      return
    }

    const nextIndex = pitchNextIndexRef.current.get(result.pitch) ?? 0
    if (nextIndex >= notesForPitch.length) {
      return
    }

    const noteToColor = notesForPitch[nextIndex]!
    applyColor(noteToColor.elementId, state)
    pitchNextIndexRef.current.set(result.pitch, nextIndex + 1)
  }, [applyColor])

  // Mark notes as missed when playhead passes them
  const markMissedNotes = useCallback((currentTime: number) => {
    const graceMs = TIMING_TOLERANCE_MS // 150ms grace period

    for (const note of allNotesRef.current) {
      const currentState = colorStateRef.current.get(note.elementId)
      // Only mark as missed if still pending and time + grace has passed
      if (currentState?.state === "pending" && note.onset + graceMs < currentTime) {
        applyColor(note.elementId, "missed")
      }
    }
  }, [applyColor])

  // Reset all notes to pending (black)
  const resetColors = useCallback(() => {
    // Reset visual colors
    for (const [elementId] of colorStateRef.current) {
      applyColor(elementId, "pending")
    }
    // Reset pitch indices
    for (const pitch of pitchNextIndexRef.current.keys()) {
      pitchNextIndexRef.current.set(pitch, 0)
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
  }), [initializeNoteMap, processNoteResult, markMissedNotes, resetColors, getNoteStates])
}
