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
        playedTime: 50,
        expectedNoteTime: 0,
        timingOffset: 50,
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
        playedTime: 0,
        expectedNoteTime: 0,
        timingOffset: 0,
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
        playedTime: 0,
        expectedNoteTime: null,
        timingOffset: 0,
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
          playedTime: 0,
          expectedNoteTime: 0,
          timingOffset: 0,
        })
      })

      expect(getNoteColor("note1")).toBe("#16a34a")
      expect(getNoteColor("note2")).toBeNull()

      // Second C4
      act(() => {
        result.current.processNoteResult({
          pitch: 60,
          result: "correct",
          playedTime: 1000,
          expectedNoteTime: 1000,
          timingOffset: 0,
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
          playedTime: 0,
          expectedNoteTime: 0,
          timingOffset: 0,
        })
        result.current.processNoteResult({
          pitch: 62,
          result: "wrong",
          playedTime: 500,
          expectedNoteTime: 500,
          timingOffset: 0,
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
          playedTime: 0,
          expectedNoteTime: 0,
          timingOffset: 0,
        })
        result.current.processNoteResult({
          pitch: 62,
          result: "correct",
          playedTime: 500,
          expectedNoteTime: 500,
          timingOffset: 0,
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

  describe("chord handling", () => {
    it("colors all chord notes correctly when played in order", () => {
      createMockNoteElement("note-c")
      createMockNoteElement("note-e")
      createMockNoteElement("note-g")

      const { result } = renderHook(() => useNoteColoring())

      // C major chord (all at same onset)
      act(() => {
        result.current.initializeNoteMap([
          { elementId: "note-c", pitch: 60, onset: 0, duration: 500, page: 1 },
          { elementId: "note-e", pitch: 64, onset: 0, duration: 500, page: 1 },
          { elementId: "note-g", pitch: 67, onset: 0, duration: 500, page: 1 },
        ])
      })

      // Play chord notes in order
      act(() => {
        result.current.processNoteResult({
          pitch: 60,
          result: "correct",
          playedTime: 10,
          expectedNoteTime: 0,
          timingOffset: 10,
        })
      })
      expect(getNoteColor("note-c")).toBe("#16a34a") // green

      act(() => {
        result.current.processNoteResult({
          pitch: 64,
          result: "correct",
          playedTime: 15,
          expectedNoteTime: 0,
          timingOffset: 15,
        })
      })
      expect(getNoteColor("note-e")).toBe("#16a34a")

      act(() => {
        result.current.processNoteResult({
          pitch: 67,
          result: "correct",
          playedTime: 20,
          expectedNoteTime: 0,
          timingOffset: 20,
        })
      })
      expect(getNoteColor("note-g")).toBe("#16a34a")
    })

    it("colors chord notes correctly when played out of order", () => {
      createMockNoteElement("note-c")
      createMockNoteElement("note-e")
      createMockNoteElement("note-g")

      const { result } = renderHook(() => useNoteColoring())

      act(() => {
        result.current.initializeNoteMap([
          { elementId: "note-c", pitch: 60, onset: 0, duration: 500, page: 1 },
          { elementId: "note-e", pitch: 64, onset: 0, duration: 500, page: 1 },
          { elementId: "note-g", pitch: 67, onset: 0, duration: 500, page: 1 },
        ])
      })

      // Play out of order: G, C, E
      act(() => {
        result.current.processNoteResult({
          pitch: 67,
          result: "correct",
          playedTime: 10,
          expectedNoteTime: 0,
          timingOffset: 10,
        })
        result.current.processNoteResult({
          pitch: 60,
          result: "correct",
          playedTime: 15,
          expectedNoteTime: 0,
          timingOffset: 15,
        })
        result.current.processNoteResult({
          pitch: 64,
          result: "correct",
          playedTime: 20,
          expectedNoteTime: 0,
          timingOffset: 20,
        })
      })

      expect(getNoteColor("note-c")).toBe("#16a34a")
      expect(getNoteColor("note-e")).toBe("#16a34a")
      expect(getNoteColor("note-g")).toBe("#16a34a")
    })

    it("colors only played notes in partial chord", () => {
      createMockNoteElement("note-c")
      createMockNoteElement("note-e")
      createMockNoteElement("note-g")

      const { result } = renderHook(() => useNoteColoring())

      act(() => {
        result.current.initializeNoteMap([
          { elementId: "note-c", pitch: 60, onset: 0, duration: 500, page: 1 },
          { elementId: "note-e", pitch: 64, onset: 0, duration: 500, page: 1 },
          { elementId: "note-g", pitch: 67, onset: 0, duration: 500, page: 1 },
        ])
      })

      // Play only C and G (miss E)
      act(() => {
        result.current.processNoteResult({
          pitch: 60,
          result: "correct",
          playedTime: 10,
          expectedNoteTime: 0,
          timingOffset: 10,
        })
        result.current.processNoteResult({
          pitch: 67,
          result: "correct",
          playedTime: 20,
          expectedNoteTime: 0,
          timingOffset: 20,
        })
      })

      expect(getNoteColor("note-c")).toBe("#16a34a")
      expect(getNoteColor("note-e")).toBeNull() // Still pending
      expect(getNoteColor("note-g")).toBe("#16a34a")
    })

    it("uses time-based matching for same pitch at different times", () => {
      // Scenario: chord at t=0 with C4, then melody C4 at t=1000
      // If player plays the melody C4 first, it should color the correct note
      createMockNoteElement("chord-c")
      createMockNoteElement("chord-e")
      createMockNoteElement("melody-c")

      const { result } = renderHook(() => useNoteColoring())

      act(() => {
        result.current.initializeNoteMap([
          { elementId: "chord-c", pitch: 60, onset: 0, duration: 500, page: 1 },
          { elementId: "chord-e", pitch: 64, onset: 0, duration: 500, page: 1 },
          { elementId: "melody-c", pitch: 60, onset: 1000, duration: 500, page: 1 },
        ])
      })

      // Server says "melody C4 at t=1000 was played"
      act(() => {
        result.current.processNoteResult({
          pitch: 60,
          result: "correct",
          playedTime: 1050,
          expectedNoteTime: 1000, // This is the key: server tells us which note matched
          timingOffset: 50,
        })
      })

      // melody-c should be colored, NOT chord-c (which was the first C4 in the list)
      expect(getNoteColor("chord-c")).toBeNull() // Still pending
      expect(getNoteColor("melody-c")).toBe("#16a34a") // Colored green
    })

    it("marks missed chord note as red while others stay green", () => {
      createMockNoteElement("note-c")
      createMockNoteElement("note-e")
      createMockNoteElement("note-g")

      const { result } = renderHook(() => useNoteColoring())

      act(() => {
        result.current.initializeNoteMap([
          { elementId: "note-c", pitch: 60, onset: 0, duration: 500, page: 1 },
          { elementId: "note-e", pitch: 64, onset: 0, duration: 500, page: 1 },
          { elementId: "note-g", pitch: 67, onset: 0, duration: 500, page: 1 },
        ])
      })

      // Play C and G correctly, but E is wrong (wrong pitch played)
      act(() => {
        result.current.processNoteResult({
          pitch: 60,
          result: "correct",
          playedTime: 10,
          expectedNoteTime: 0,
          timingOffset: 10,
        })
        result.current.processNoteResult({
          pitch: 64,
          result: "wrong",
          playedTime: 200,
          expectedNoteTime: 0,
          timingOffset: 200, // Late
        })
        result.current.processNoteResult({
          pitch: 67,
          result: "correct",
          playedTime: 20,
          expectedNoteTime: 0,
          timingOffset: 20,
        })
      })

      expect(getNoteColor("note-c")).toBe("#16a34a") // green
      expect(getNoteColor("note-e")).toBe("#dc2626") // red (wrong)
      expect(getNoteColor("note-g")).toBe("#16a34a") // green
    })
  })

  describe("markMissedNotes", () => {
    it("marks pending notes as missed when time passes at 100% tempo", () => {
      createMockNoteElement("note1")
      createMockNoteElement("note2")

      const { result } = renderHook(() => useNoteColoring())

      act(() => {
        result.current.initializeNoteMap([
          { elementId: "note1", pitch: 60, onset: 0, duration: 500, page: 1 },
          { elementId: "note2", pitch: 62, onset: 1000, duration: 500, page: 1 },
        ])
      })

      // Time passes note1's onset + grace period (300ms at 100% tempo)
      act(() => {
        result.current.markMissedNotes(350, 100)
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
          playedTime: 0,
          expectedNoteTime: 0,
          timingOffset: 0,
        })
      })

      // Try to mark as missed
      act(() => {
        result.current.markMissedNotes(350, 100)
      })

      // Should still be green (correct), not gray (missed)
      expect(getNoteColor("note1")).toBe("#16a34a")
      expect(result.current.getNoteStates().get("note1")?.state).toBe("correct")
    })

    it("at 50% tempo: notes not marked missed too early", () => {
      createMockNoteElement("note1")

      const { result } = renderHook(() => useNoteColoring())

      act(() => {
        result.current.initializeNoteMap([
          { elementId: "note1", pitch: 60, onset: 1000, duration: 500, page: 1 },
        ])
      })

      // At 50% tempo, the playhead reaches 1000ms piece time after 2000ms wall time.
      // The 300ms wall-time grace = 150ms piece-time grace at 50% tempo.
      // So the note should be missed when piece time > 1000 + 150 = 1150ms.
      // At piece time 1100ms, note should NOT be missed yet (< 1150ms threshold).
      act(() => {
        result.current.markMissedNotes(1100, 50)
      })

      expect(getNoteColor("note1")).toBeNull() // still pending
      expect(result.current.getNoteStates().get("note1")?.state).toBe("pending")

      // At piece time 1200ms, note SHOULD be missed (> 1150ms threshold).
      act(() => {
        result.current.markMissedNotes(1200, 50)
      })

      expect(getNoteColor("note1")).toBe("#9ca3af") // gray (missed)
      expect(result.current.getNoteStates().get("note1")?.state).toBe("missed")
    })

    it("at 150% tempo: notes not marked missed too late", () => {
      createMockNoteElement("note1")

      const { result } = renderHook(() => useNoteColoring())

      act(() => {
        result.current.initializeNoteMap([
          { elementId: "note1", pitch: 60, onset: 1000, duration: 500, page: 1 },
        ])
      })

      // At 150% tempo, the playhead reaches 1000ms piece time after ~667ms wall time.
      // The 300ms wall-time grace = 450ms piece-time grace at 150% tempo.
      // So the note should be missed when piece time > 1000 + 450 = 1450ms.
      // At piece time 1400ms, note should NOT be missed yet (< 1450ms threshold).
      act(() => {
        result.current.markMissedNotes(1400, 150)
      })

      expect(getNoteColor("note1")).toBeNull() // still pending
      expect(result.current.getNoteStates().get("note1")?.state).toBe("pending")

      // At piece time 1500ms, note SHOULD be missed (> 1450ms threshold).
      act(() => {
        result.current.markMissedNotes(1500, 150)
      })

      expect(getNoteColor("note1")).toBe("#9ca3af") // gray (missed)
      expect(result.current.getNoteStates().get("note1")?.state).toBe("missed")
    })
  })
})
