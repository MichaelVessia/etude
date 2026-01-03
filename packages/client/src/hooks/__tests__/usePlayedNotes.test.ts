import { describe, expect, it, beforeEach } from "bun:test"
import { renderHook, act } from "@testing-library/react"
import { useExtraNotes } from "../usePlayedNotes.js"
import type { NoteElementInfo } from "../useVerovio.js"
import type { NoteSubmitResult } from "../useSession.js"
import type { PlayheadPosition } from "../usePlayhead.js"

// Create mock SVG environment
function createMockSvgWithNotes(
  notes: Array<{ id: string; pitch: number; top: number; left: number; width: number; height: number }>
): SVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
  svg.getBoundingClientRect = () => ({
    top: 0,
    left: 0,
    bottom: 500,
    right: 800,
    width: 800,
    height: 500,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  })

  for (const note of notes) {
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g")
    g.id = note.id
    g.getBoundingClientRect = () => ({
      top: note.top,
      left: note.left,
      bottom: note.top + note.height,
      right: note.left + note.width,
      width: note.width,
      height: note.height,
      x: note.left,
      y: note.top,
      toJSON: () => ({}),
    })
    svg.appendChild(g)
    document.body.appendChild(g)
  }

  document.body.appendChild(svg)
  return svg
}

describe("useExtraNotes", () => {
  beforeEach(() => {
    document.body.innerHTML = ""
  })

  describe("initial state", () => {
    it("starts with empty extra notes and undefined staff bounds", () => {
      const { result } = renderHook(() => useExtraNotes())

      expect(result.current.extraNotes).toEqual([])
      expect(result.current.staffBounds).toBeUndefined()
    })
  })

  describe("initializePitchMap", () => {
    it("calculates staff bounds from note elements", () => {
      const svg = createMockSvgWithNotes([
        { id: "note1", pitch: 60, top: 100, left: 50, width: 20, height: 15 },
        { id: "note2", pitch: 72, top: 50, left: 100, width: 20, height: 15 },
      ])

      const { result } = renderHook(() => useExtraNotes())

      const noteElements: NoteElementInfo[] = [
        { elementId: "note1", pitch: 60, onset: 0, duration: 500, page: 1 },
        { elementId: "note2", pitch: 72, onset: 500, duration: 500, page: 1 },
      ]

      act(() => {
        result.current.initializePitchMap(noteElements, svg)
      })

      expect(result.current.staffBounds).toBeDefined()
      expect(result.current.staffBounds?.minPitch).toBe(60)
      expect(result.current.staffBounds?.maxPitch).toBe(72)
      expect(result.current.staffBounds?.noteWidth).toBe(20)
      expect(result.current.staffBounds?.noteHeight).toBe(15)
    })

    it("handles empty note elements", () => {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
      svg.getBoundingClientRect = () => ({
        top: 0,
        left: 0,
        bottom: 500,
        right: 800,
        width: 800,
        height: 500,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      })
      document.body.appendChild(svg)

      const { result } = renderHook(() => useExtraNotes())

      act(() => {
        result.current.initializePitchMap([], svg)
      })

      // staffBounds should remain undefined when no notes
      expect(result.current.staffBounds).toBeUndefined()
    })

    it("averages Y positions for notes with same pitch", () => {
      const svg = createMockSvgWithNotes([
        { id: "note1", pitch: 60, top: 100, left: 50, width: 20, height: 10 },
        { id: "note2", pitch: 60, top: 110, left: 100, width: 20, height: 10 },
      ])

      const { result } = renderHook(() => useExtraNotes())

      const noteElements: NoteElementInfo[] = [
        { elementId: "note1", pitch: 60, onset: 0, duration: 500, page: 1 },
        { elementId: "note2", pitch: 60, onset: 500, duration: 500, page: 1 },
      ]

      act(() => {
        result.current.initializePitchMap(noteElements, svg)
      })

      // Y positions: note1 = 100 + 10/2 = 105, note2 = 110 + 10/2 = 115
      // Average = 110
      expect(result.current.staffBounds).toBeDefined()
      expect(result.current.staffBounds?.minY).toBe(105)
      expect(result.current.staffBounds?.maxY).toBe(115)
    })
  })

  describe("addExtraNote", () => {
    it("adds extra note indicator at playhead position", () => {
      const svg = createMockSvgWithNotes([
        { id: "note1", pitch: 60, top: 100, left: 50, width: 20, height: 15 },
        { id: "note2", pitch: 72, top: 50, left: 100, width: 20, height: 15 },
      ])

      const { result } = renderHook(() => useExtraNotes())

      const noteElements: NoteElementInfo[] = [
        { elementId: "note1", pitch: 60, onset: 0, duration: 500, page: 1 },
        { elementId: "note2", pitch: 72, onset: 500, duration: 500, page: 1 },
      ]

      act(() => {
        result.current.initializePitchMap(noteElements, svg)
      })

      const extraResult: NoteSubmitResult = {
        pitch: 65,
        result: "extra",
        timingOffset: 0,
        expectedNoteTime: null,
      }

      const playheadPosition: PlayheadPosition = {
        x: 150,
        y: 75,
        height: 50,
        page: 1,
        
        
        
      }

      act(() => {
        result.current.addExtraNote(extraResult, playheadPosition)
      })

      expect(result.current.extraNotes).toHaveLength(1)
      expect(result.current.extraNotes[0].pitch).toBe(65)
      expect(result.current.extraNotes[0].x).toBe(150)
      expect(result.current.extraNotes[0].id).toMatch(/^extra-\d+$/)
    })

    it("ignores non-extra results", () => {
      const svg = createMockSvgWithNotes([
        { id: "note1", pitch: 60, top: 100, left: 50, width: 20, height: 15 },
      ])

      const { result } = renderHook(() => useExtraNotes())

      act(() => {
        result.current.initializePitchMap(
          [{ elementId: "note1", pitch: 60, onset: 0, duration: 500, page: 1 }],
          svg
        )
      })

      const correctResult: NoteSubmitResult = {
        pitch: 60,
        result: "correct",
        timingOffset: 0,
        expectedNoteTime: 0,
      }

      const playheadPosition: PlayheadPosition = {
        x: 150,
        y: 75,
        height: 50,
        page: 1,
        
        
        
      }

      act(() => {
        result.current.addExtraNote(correctResult, playheadPosition)
      })

      expect(result.current.extraNotes).toHaveLength(0)
    })

    it("ignores extra notes when staff bounds not initialized", () => {
      const { result } = renderHook(() => useExtraNotes())

      const extraResult: NoteSubmitResult = {
        pitch: 65,
        result: "extra",
        timingOffset: 0,
        expectedNoteTime: null,
      }

      const playheadPosition: PlayheadPosition = {
        x: 150,
        y: 75,
        height: 50,
        page: 1,
        
        
        
      }

      act(() => {
        result.current.addExtraNote(extraResult, playheadPosition)
      })

      expect(result.current.extraNotes).toHaveLength(0)
    })

    it("uses pitch map Y position when pitch exists in map", () => {
      const svg = createMockSvgWithNotes([
        { id: "note1", pitch: 60, top: 100, left: 50, width: 20, height: 10 },
      ])

      const { result } = renderHook(() => useExtraNotes())

      act(() => {
        result.current.initializePitchMap(
          [{ elementId: "note1", pitch: 60, onset: 0, duration: 500, page: 1 }],
          svg
        )
      })

      const extraResult: NoteSubmitResult = {
        pitch: 60,
        result: "extra",
        timingOffset: 0,
        expectedNoteTime: null,
      }

      const playheadPosition: PlayheadPosition = {
        x: 150,
        y: 75,
        height: 50,
        page: 1,
        
        
        
      }

      act(() => {
        result.current.addExtraNote(extraResult, playheadPosition)
      })

      expect(result.current.extraNotes).toHaveLength(1)
      // Y should be from pitch map: top (100) + height/2 (5) = 105
      expect(result.current.extraNotes[0].y).toBe(105)
    })

    it("interpolates Y position for unknown pitch", () => {
      const svg = createMockSvgWithNotes([
        { id: "note1", pitch: 60, top: 200, left: 50, width: 20, height: 10 },
        { id: "note2", pitch: 72, top: 100, left: 100, width: 20, height: 10 },
      ])

      const { result } = renderHook(() => useExtraNotes())

      act(() => {
        result.current.initializePitchMap(
          [
            { elementId: "note1", pitch: 60, onset: 0, duration: 500, page: 1 },
            { elementId: "note2", pitch: 72, onset: 500, duration: 500, page: 1 },
          ],
          svg
        )
      })

      const extraResult: NoteSubmitResult = {
        pitch: 66, // middle pitch (halfway between 60 and 72)
        result: "extra",
        timingOffset: 0,
        expectedNoteTime: null,
      }

      const playheadPosition: PlayheadPosition = {
        x: 150,
        y: 75,
        height: 50,
        page: 1,
        
        
        
      }

      act(() => {
        result.current.addExtraNote(extraResult, playheadPosition)
      })

      expect(result.current.extraNotes).toHaveLength(1)
      // Interpolated Y should be calculated based on pitch ratio
      expect(result.current.extraNotes[0].y).toBeGreaterThan(100)
      expect(result.current.extraNotes[0].y).toBeLessThan(210)
    })

    it("generates unique IDs for multiple extra notes", () => {
      const svg = createMockSvgWithNotes([
        { id: "note1", pitch: 60, top: 100, left: 50, width: 20, height: 15 },
      ])

      const { result } = renderHook(() => useExtraNotes())

      act(() => {
        result.current.initializePitchMap(
          [{ elementId: "note1", pitch: 60, onset: 0, duration: 500, page: 1 }],
          svg
        )
      })

      const playheadPosition: PlayheadPosition = {
        x: 150,
        y: 75,
        height: 50,
        page: 1,
        
        
        
      }

      act(() => {
        result.current.addExtraNote(
          { pitch: 65, result: "extra", timingOffset: 0, expectedNoteTime: null },
          playheadPosition
        )
        result.current.addExtraNote(
          { pitch: 67, result: "extra", timingOffset: 0, expectedNoteTime: null },
          playheadPosition
        )
      })

      expect(result.current.extraNotes).toHaveLength(2)
      expect(result.current.extraNotes[0].id).not.toBe(result.current.extraNotes[1].id)
    })
  })

  describe("clear", () => {
    it("clears all extra notes", () => {
      const svg = createMockSvgWithNotes([
        { id: "note1", pitch: 60, top: 100, left: 50, width: 20, height: 15 },
      ])

      const { result } = renderHook(() => useExtraNotes())

      act(() => {
        result.current.initializePitchMap(
          [{ elementId: "note1", pitch: 60, onset: 0, duration: 500, page: 1 }],
          svg
        )
      })

      const playheadPosition: PlayheadPosition = {
        x: 150,
        y: 75,
        height: 50,
        page: 1,
        
        
        
      }

      act(() => {
        result.current.addExtraNote(
          { pitch: 65, result: "extra", timingOffset: 0, expectedNoteTime: null },
          playheadPosition
        )
      })

      expect(result.current.extraNotes).toHaveLength(1)

      act(() => {
        result.current.clear()
      })

      expect(result.current.extraNotes).toHaveLength(0)
    })

    it("resets note ID counter", () => {
      const svg = createMockSvgWithNotes([
        { id: "note1", pitch: 60, top: 100, left: 50, width: 20, height: 15 },
      ])

      const { result } = renderHook(() => useExtraNotes())

      act(() => {
        result.current.initializePitchMap(
          [{ elementId: "note1", pitch: 60, onset: 0, duration: 500, page: 1 }],
          svg
        )
      })

      const playheadPosition: PlayheadPosition = {
        x: 150,
        y: 75,
        height: 50,
        page: 1,
        
        
        
      }

      // Add some notes
      act(() => {
        result.current.addExtraNote(
          { pitch: 65, result: "extra", timingOffset: 0, expectedNoteTime: null },
          playheadPosition
        )
        result.current.addExtraNote(
          { pitch: 67, result: "extra", timingOffset: 0, expectedNoteTime: null },
          playheadPosition
        )
      })

      // Clear
      act(() => {
        result.current.clear()
      })

      // Add new note - should start from 0 again
      act(() => {
        result.current.addExtraNote(
          { pitch: 69, result: "extra", timingOffset: 0, expectedNoteTime: null },
          playheadPosition
        )
      })

      expect(result.current.extraNotes[0].id).toBe("extra-0")
    })
  })
})
