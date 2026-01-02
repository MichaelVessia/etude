import { useState, useRef, useCallback } from "react"
import type { NoteSubmitResult } from "./useSession.js"
import type { PlayheadPosition } from "./usePlayhead.js"
import type { NoteElementInfo } from "./useVerovio.js"

export interface ExtraNoteIndicator {
  id: string
  pitch: number
  x: number
  y: number
}

export interface StaffBounds {
  minY: number
  maxY: number
  minPitch: number
  maxPitch: number
  noteWidth: number
  noteHeight: number
}

export interface UseExtraNotesResult {
  extraNotes: ExtraNoteIndicator[]
  staffBounds: StaffBounds | undefined
  initializePitchMap: (noteElements: NoteElementInfo[], svgElement: SVGElement) => void
  addExtraNote: (result: NoteSubmitResult, playheadPosition: PlayheadPosition) => void
  clear: () => void
}

/**
 * Manages extra note indicators (notes played that aren't in the score)
 */
export function useExtraNotes(): UseExtraNotesResult {
  const [extraNotes, setExtraNotes] = useState<ExtraNoteIndicator[]>([])
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
    const noteWidths: number[] = []
    const noteHeights: number[] = []

    for (const note of noteElements) {
      const el = document.getElementById(note.elementId)
      if (!el) continue

      const bounds = el.getBoundingClientRect()
      const y = bounds.top - svgBounds.top + bounds.height / 2

      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)
      minPitch = Math.min(minPitch, note.pitch)
      maxPitch = Math.max(maxPitch, note.pitch)
      noteWidths.push(bounds.width)
      noteHeights.push(bounds.height)

      if (!pitchYMap.has(note.pitch)) {
        pitchYMap.set(note.pitch, [])
      }
      pitchYMap.get(note.pitch)!.push(y)
    }

    const finalPitchMap = new Map<number, number>()
    for (const [pitch, yValues] of pitchYMap) {
      const avgY = yValues.reduce((a, b) => a + b, 0) / yValues.length
      finalPitchMap.set(pitch, avgY)
    }
    pitchToYMapRef.current = finalPitchMap

    if (minY !== Infinity) {
      const avgWidth = noteWidths.reduce((a, b) => a + b, 0) / noteWidths.length
      const avgHeight = noteHeights.reduce((a, b) => a + b, 0) / noteHeights.length
      setStaffBounds({ minY, maxY, minPitch, maxPitch, noteWidth: avgWidth, noteHeight: avgHeight })
    }
  }, [])

  const addExtraNote = useCallback((result: NoteSubmitResult, playheadPosition: PlayheadPosition) => {
    // Only track extra notes
    if (result.result !== "extra") return

    const bounds = staffBounds
    if (!bounds) return

    const x = playheadPosition.x

    // Get Y position from pitch map, or interpolate
    let y: number
    const pitchMap = pitchToYMapRef.current
    if (pitchMap.has(result.pitch)) {
      y = pitchMap.get(result.pitch)!
    } else {
      const pitchRange = bounds.maxPitch - bounds.minPitch || 1
      const yRange = bounds.maxY - bounds.minY
      const pitchRatio = (result.pitch - bounds.minPitch) / pitchRange
      y = bounds.maxY - pitchRatio * yRange
    }

    const indicator: ExtraNoteIndicator = {
      id: `extra-${noteIdCounter.current++}`,
      pitch: result.pitch,
      x,
      y,
    }

    setExtraNotes(prev => [...prev, indicator])
  }, [staffBounds])

  const clear = useCallback(() => {
    setExtraNotes([])
    noteIdCounter.current = 0
  }, [])

  return {
    extraNotes,
    staffBounds,
    initializePitchMap,
    addExtraNote,
    clear,
  }
}
