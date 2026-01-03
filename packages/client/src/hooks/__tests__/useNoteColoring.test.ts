import { describe, expect, it, beforeEach } from "bun:test"
import { renderHook, act } from "@testing-library/react"
import { useNoteColoring } from "../useNoteColoring.js"
import type { NoteElementInfo } from "../useVerovio.js"
import type { NoteSubmitResult } from "../useSession.js"

// Helper to create mock SVG note elements
function createMockNoteElement(id: string): void {
  const g = document.createElementNS("http://www.w3.org/2000/svg", "g")
  g.id = id
  g.classList.add("note")
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use")
  g.appendChild(use)
  document.body.appendChild(g)
}

// Helper to get fill color from note element
function getNoteColor(id: string): string | null {
  const note = document.getElementById(id)
  const use = note?.querySelector("use")
  return use?.getAttribute("fill") ?? null
}

// Helper to clear fill from note (simulates React re-render)
function clearNoteColor(id: string): void {
  const note = document.getElementById(id)
  const use = note?.querySelector("use")
  use?.removeAttribute("fill")
  use?.removeAttribute("stroke")
}

describe("useNoteColoring", () => {
  beforeEach(() => {
    document.body.innerHTML = ""
  })

  describe("initializeNoteMap", () => {
    it("initializes pitch-to-notes mapping", () => {
      createMockNoteElement("note1")
      createMockNoteElement("note2")

      const { result } = renderHook(() => useNoteColoring())

      const noteElements: NoteElementInfo[] = [
        { elementId: "note1", pitch: 60, onset: 0, duration: 500, page: 1 },
        { elementId: "note2", pitch: 62, onset: 500, duration: 500, page: 1 },
      ]

      act(() => {
        result.current.initializeNoteMap(noteElements)
      })

      const states = result.current.getNoteStates()
      expect(states.size).toBe(2)
      expect(states.get("note1")?.state).toBe("pending")
      expect(states.get("note2")?.state).toBe("pending")
    })
  })

  describe("processNoteResult", () => {
    it("colors note green for correct result within timing tolerance", () => {
      createMockNoteElement("note1")

      const { result } = renderHook(() => useNoteColoring())

      act(() => {
        result.current.initializeNoteMap([
          { elementId: "note1", pitch: 60, onset: 0, duration: 500, page: 1 },
        ])
      })

      const noteResult: NoteSubmitResult = {
        pitch: 60,
        result: "correct",
        timingOffset: 50,
        expectedNoteTime: 0,
      }

      act(() => {
        result.current.processNoteResult(noteResult)
      })

      expect(getNoteColor("note1")).toBe("#16a34a") // green
      expect(result.current.getNoteStates().get("note1")?.state).toBe("correct")
    })

    it("colors note red for wrong result", () => {
      createMockNoteElement("note1")

      const { result } = renderHook(() => useNoteColoring())

      act(() => {
        result.current.initializeNoteMap([
          { elementId: "note1", pitch: 60, onset: 0, duration: 500, page: 1 },
        ])
      })

      const noteResult: NoteSubmitResult = {
        pitch: 60,
        result: "wrong",
        timingOffset: 0,
        expectedNoteTime: 0,
      }

      act(() => {
        result.current.processNoteResult(noteResult)
      })

      expect(getNoteColor("note1")).toBe("#dc2626") // red
    })

    it("skips extra notes (no visual feedback)", () => {
      createMockNoteElement("note1")

      const { result } = renderHook(() => useNoteColoring())

      act(() => {
        result.current.initializeNoteMap([
          { elementId: "note1", pitch: 60, onset: 0, duration: 500, page: 1 },
        ])
      })

      const noteResult: NoteSubmitResult = {
        pitch: 60,
        result: "extra",
        timingOffset: 0,
        expectedNoteTime: null,
      }

      act(() => {
        result.current.processNoteResult(noteResult)
      })

      expect(getNoteColor("note1")).toBeNull() // no color applied
      expect(result.current.getNoteStates().get("note1")?.state).toBe("pending")
    })

    it("colors notes in sequence for same pitch", () => {
      createMockNoteElement("note1")
      createMockNoteElement("note2")

      const { result } = renderHook(() => useNoteColoring())

      act(() => {
        result.current.initializeNoteMap([
          { elementId: "note1", pitch: 60, onset: 0, duration: 500, page: 1 },
          { elementId: "note2", pitch: 60, onset: 1000, duration: 500, page: 1 },
        ])
      })

      // First C4
      act(() => {
        result.current.processNoteResult({
          pitch: 60,
          result: "correct",
          timingOffset: 0,
          expectedNoteTime: 0,
        })
      })

      expect(getNoteColor("note1")).toBe("#16a34a")
      expect(getNoteColor("note2")).toBeNull()

      // Second C4
      act(() => {
        result.current.processNoteResult({
          pitch: 60,
          result: "correct",
          timingOffset: 0,
          expectedNoteTime: 1000,
        })
      })

      expect(getNoteColor("note1")).toBe("#16a34a")
      expect(getNoteColor("note2")).toBe("#16a34a")
    })
  })

  describe("reapplyColors", () => {
    it("re-applies colors after DOM is reset (simulating React re-render)", () => {
      createMockNoteElement("note1")
      createMockNoteElement("note2")

      const { result } = renderHook(() => useNoteColoring())

      act(() => {
        result.current.initializeNoteMap([
          { elementId: "note1", pitch: 60, onset: 0, duration: 500, page: 1 },
          { elementId: "note2", pitch: 62, onset: 500, duration: 500, page: 1 },
        ])
      })

      // Color both notes
      act(() => {
        result.current.processNoteResult({
          pitch: 60,
          result: "correct",
          timingOffset: 0,
          expectedNoteTime: 0,
        })
        result.current.processNoteResult({
          pitch: 62,
          result: "wrong",
          timingOffset: 0,
          expectedNoteTime: 500,
        })
      })

      expect(getNoteColor("note1")).toBe("#16a34a")
      expect(getNoteColor("note2")).toBe("#dc2626")

      // Simulate React re-render wiping DOM colors
      clearNoteColor("note1")
      clearNoteColor("note2")

      expect(getNoteColor("note1")).toBeNull()
      expect(getNoteColor("note2")).toBeNull()

      // Re-apply colors
      act(() => {
        result.current.reapplyColors()
      })

      expect(getNoteColor("note1")).toBe("#16a34a")
      expect(getNoteColor("note2")).toBe("#dc2626")
    })

    it("does not apply color to pending notes", () => {
      createMockNoteElement("note1")

      const { result } = renderHook(() => useNoteColoring())

      act(() => {
        result.current.initializeNoteMap([
          { elementId: "note1", pitch: 60, onset: 0, duration: 500, page: 1 },
        ])
      })

      // Note is pending, no color should be applied
      act(() => {
        result.current.reapplyColors()
      })

      expect(getNoteColor("note1")).toBeNull()
    })
  })

  describe("resetColors", () => {
    it("resets all notes to pending state", () => {
      createMockNoteElement("note1")
      createMockNoteElement("note2")

      const { result } = renderHook(() => useNoteColoring())

      act(() => {
        result.current.initializeNoteMap([
          { elementId: "note1", pitch: 60, onset: 0, duration: 500, page: 1 },
          { elementId: "note2", pitch: 62, onset: 500, duration: 500, page: 1 },
        ])
      })

      // Color both notes
      act(() => {
        result.current.processNoteResult({
          pitch: 60,
          result: "correct",
          timingOffset: 0,
          expectedNoteTime: 0,
        })
        result.current.processNoteResult({
          pitch: 62,
          result: "correct",
          timingOffset: 0,
          expectedNoteTime: 500,
        })
      })

      // Reset
      act(() => {
        result.current.resetColors()
      })

      // Colors should be black (pending)
      expect(getNoteColor("note1")).toBe("#000000")
      expect(getNoteColor("note2")).toBe("#000000")

      // State should be pending
      expect(result.current.getNoteStates().get("note1")?.state).toBe("pending")
      expect(result.current.getNoteStates().get("note2")?.state).toBe("pending")
    })
  })

  describe("markMissedNotes", () => {
    it("marks pending notes as missed when time passes", () => {
      createMockNoteElement("note1")
      createMockNoteElement("note2")

      const { result } = renderHook(() => useNoteColoring())

      act(() => {
        result.current.initializeNoteMap([
          { elementId: "note1", pitch: 60, onset: 0, duration: 500, page: 1 },
          { elementId: "note2", pitch: 62, onset: 1000, duration: 500, page: 1 },
        ])
      })

      // Time passes note1's onset + grace period (300ms)
      act(() => {
        result.current.markMissedNotes(350)
      })

      expect(getNoteColor("note1")).toBe("#9ca3af") // gray (missed)
      expect(getNoteColor("note2")).toBeNull() // still pending (not past yet)
      expect(result.current.getNoteStates().get("note1")?.state).toBe("missed")
    })

    it("does not mark already colored notes as missed", () => {
      createMockNoteElement("note1")

      const { result } = renderHook(() => useNoteColoring())

      act(() => {
        result.current.initializeNoteMap([
          { elementId: "note1", pitch: 60, onset: 0, duration: 500, page: 1 },
        ])
      })

      // Color note as correct
      act(() => {
        result.current.processNoteResult({
          pitch: 60,
          result: "correct",
          timingOffset: 0,
          expectedNoteTime: 0,
        })
      })

      // Try to mark as missed
      act(() => {
        result.current.markMissedNotes(350)
      })

      // Should still be green (correct), not gray (missed)
      expect(getNoteColor("note1")).toBe("#16a34a")
      expect(result.current.getNoteStates().get("note1")?.state).toBe("correct")
    })
  })
})
