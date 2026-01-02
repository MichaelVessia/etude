import { useState, useRef, useCallback } from "react"
import type { PlayedNoteIndicator } from "../components/PlayedNoteIndicators.js"
import type { NoteSubmitResult } from "./useSession.js"
import type { PlayheadPosition } from "./usePlayhead.js"
import type { NoteElementInfo } from "./useVerovio.js"

export interface StaffBounds {
  minY: number
  maxY: number
  minPitch: number
  maxPitch: number
}

export interface UsePlayedNotesResult {
  playedNotes: PlayedNoteIndicator[]
  staffBounds: StaffBounds | undefined
  /** Call when note elements are ready to build pitch-to-Y mapping */
  initializePitchMap: (noteElements: NoteElementInfo[], svgElement: SVGElement) => void
  /** Call when a new note result arrives during active session */
  addNoteIndicator: (result: NoteSubmitResult, playheadPosition: PlayheadPosition) => void
  /** Clear all indicators (call when session starts) */
  clear: () => void
}

/**
 * Manages played note visual indicators on the staff
 */
export function usePlayedNotes(): UsePlayedNotesResult {
  const [playedNotes, setPlayedNotes] = useState<PlayedNoteIndicator[]>([])
  const [staffBounds, setStaffBounds] = useState<StaffBounds | undefined>()
  const noteIdCounter = useRef(0)
  const pitchToYMapRef = useRef<Map<number, number>>(new Map())

  const initializePitchMap = useCallback((noteElements: NoteElementInfo[], svgElement: SVGElement) => {
    const svgBounds = svgElement.getBoundingClientRect()
    const pitchYMap = new Map<number, number[]>()
    let minY = Infinity
    let maxY = 0
    let minPitch = Infinity
    let maxPitch = 0

    for (const note of noteElements) {
      const el = document.getElementById(note.elementId)
      if (!el) continue

      const bounds = el.getBoundingClientRect()
      const y = bounds.top - svgBounds.top + bounds.height / 2 // Center of note

      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)
      minPitch = Math.min(minPitch, note.pitch)
      maxPitch = Math.max(maxPitch, note.pitch)

      // Collect all Y values for each pitch
      if (!pitchYMap.has(note.pitch)) {
        pitchYMap.set(note.pitch, [])
      }
      pitchYMap.get(note.pitch)!.push(y)
    }

    // Average Y values for each pitch
    const finalPitchMap = new Map<number, number>()
    for (const [pitch, yValues] of pitchYMap) {
      const avgY = yValues.reduce((a, b) => a + b, 0) / yValues.length
      finalPitchMap.set(pitch, avgY)
    }
    pitchToYMapRef.current = finalPitchMap

    if (minY !== Infinity) {
      setStaffBounds({ minY, maxY, minPitch, maxPitch })
    }
  }, [])

  const addNoteIndicator = useCallback((result: NoteSubmitResult, playheadPosition: PlayheadPosition) => {
    const bounds = staffBounds
    if (!bounds) return

    const noteResult: "correct" | "wrong" | "extra" =
      result.result === "correct" ? "correct" :
      result.result === "wrong" ? "wrong" : "extra"

    // Use playhead position for X coordinate
    const x = playheadPosition.x

    // Get Y position from pitch map, or interpolate if not found
    let y: number
    const pitchMap = pitchToYMapRef.current
    if (pitchMap.has(result.pitch)) {
      y = pitchMap.get(result.pitch)!
    } else {
      // Interpolate Y based on pitch range
      // Higher pitch = lower Y (staff goes up visually)
      const pitchRange = bounds.maxPitch - bounds.minPitch || 1
      const yRange = bounds.maxY - bounds.minY
      const pitchRatio = (result.pitch - bounds.minPitch) / pitchRange
      // Invert because higher pitch = lower Y
      y = bounds.maxY - pitchRatio * yRange
    }

    const indicator: PlayedNoteIndicator = {
      id: `note-${noteIdCounter.current++}`,
      pitch: result.pitch,
      x,
      y,
      result: noteResult,
      timestamp: Date.now(),
    }

    setPlayedNotes(prev => [...prev, indicator])

    // Remove this indicator after 3 seconds
    setTimeout(() => {
      setPlayedNotes(prev => prev.filter(n => n.id !== indicator.id))
    }, 3000)
  }, [staffBounds])

  const clear = useCallback(() => {
    setPlayedNotes([])
    noteIdCounter.current = 0
  }, [])

  return {
    playedNotes,
    staffBounds,
    initializePitchMap,
    addNoteIndicator,
    clear,
  }
}
