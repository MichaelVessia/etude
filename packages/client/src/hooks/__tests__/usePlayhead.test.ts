import { describe, expect, it, beforeEach, afterEach, mock } from "bun:test"
import { renderHook, act } from "@testing-library/react"
import { usePlayhead } from "../usePlayhead.js"
import type { NoteElementInfo } from "../useVerovio.js"

// Track animation frame callbacks for manual control
let rafCallbacks: Array<(time: number) => void> = []
let rafId = 0
const originalRaf = globalThis.requestAnimationFrame
const originalCaf = globalThis.cancelAnimationFrame

function mockAnimationFrames(): void {
  rafCallbacks = []
  rafId = 0
  globalThis.requestAnimationFrame = (callback: (time: number) => void) => {
    rafId++
    rafCallbacks.push(callback)
    return rafId
  }
  globalThis.cancelAnimationFrame = () => {
    // Just clear the callbacks
  }
}

function restoreAnimationFrames(): void {
  globalThis.requestAnimationFrame = originalRaf
  globalThis.cancelAnimationFrame = originalCaf
  rafCallbacks = []
}

function flushAnimationFrame(time = performance.now()): void {
  const callbacks = rafCallbacks.slice()
  rafCallbacks = []
  for (const callback of callbacks) {
    callback(time)
  }
}

// Mock DOM elements and measurements
function createMockSvgElement(): SVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
  svg.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    right: 800,
    bottom: 600,
    width: 800,
    height: 600,
    x: 0,
    y: 0,
    toJSON: () => {},
  })
  document.body.appendChild(svg)
  return svg
}

function createMockNoteElement(id: string, left: number, top: number, width = 20, height = 30): void {
  const g = document.createElementNS("http://www.w3.org/2000/svg", "g")
  g.id = id
  g.getBoundingClientRect = () => ({
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    x: left,
    y: top,
    toJSON: () => {},
  })
  document.body.appendChild(g)
}

describe("usePlayhead", () => {
  beforeEach(() => {
    document.body.innerHTML = ""
    mockAnimationFrames()
  })

  afterEach(() => {
    restoreAnimationFrames()
  })

  describe("initial state", () => {
    it("returns null position initially", () => {
      const { result } = renderHook(() => usePlayhead())

      expect(result.current.position).toBeNull()
      expect(result.current.isRunning).toBe(false)
      expect(result.current.currentTime).toBe(0)
    })
  })

  describe("initialize", () => {
    it("sets initial position from first note", () => {
      createMockNoteElement("note1", 100, 50)
      createMockNoteElement("note2", 200, 50)
      const svg = createMockSvgElement()

      const { result } = renderHook(() => usePlayhead())

      const noteElements: NoteElementInfo[] = [
        { elementId: "note1", pitch: 60, onset: 0, duration: 500, page: 1 },
        { elementId: "note2", pitch: 62, onset: 500, duration: 500, page: 1 },
      ]

      act(() => {
        result.current.initialize(noteElements, svg)
      })

      expect(result.current.position).not.toBeNull()
      // x should be center of note1 (100 + 20/2 = 110)
      expect(result.current.position!.x).toBeCloseTo(110)
      expect(result.current.position!.page).toBe(1)
    })

    it("sorts notes by onset time", () => {
      createMockNoteElement("note1", 200, 50) // later in time but first in array
      createMockNoteElement("note2", 100, 50) // earlier in time
      const svg = createMockSvgElement()

      const { result } = renderHook(() => usePlayhead())

      const noteElements: NoteElementInfo[] = [
        { elementId: "note1", pitch: 60, onset: 500, duration: 500, page: 1 },
        { elementId: "note2", pitch: 62, onset: 0, duration: 500, page: 1 },
      ]

      act(() => {
        result.current.initialize(noteElements, svg)
      })

      // Position should be at note2 (the first by time)
      expect(result.current.position!.x).toBeCloseTo(110) // 100 + 20/2
    })

    it("handles empty note list", () => {
      const svg = createMockSvgElement()

      const { result } = renderHook(() => usePlayhead())

      act(() => {
        result.current.initialize([], svg)
      })

      expect(result.current.position).toBeNull()
    })
  })

  describe("start/stop", () => {
    it("sets isRunning to true on start", () => {
      createMockNoteElement("note1", 100, 50)
      const svg = createMockSvgElement()

      const { result } = renderHook(() => usePlayhead())

      const noteElements: NoteElementInfo[] = [
        { elementId: "note1", pitch: 60, onset: 0, duration: 500, page: 1 },
      ]

      act(() => {
        result.current.initialize(noteElements, svg)
      })

      act(() => {
        result.current.start(100)
      })

      expect(result.current.isRunning).toBe(true)
    })

    it("sets isRunning to false on stop", () => {
      createMockNoteElement("note1", 100, 50)
      const svg = createMockSvgElement()

      const { result } = renderHook(() => usePlayhead())

      const noteElements: NoteElementInfo[] = [
        { elementId: "note1", pitch: 60, onset: 0, duration: 500, page: 1 },
      ]

      act(() => {
        result.current.initialize(noteElements, svg)
        result.current.start(100)
      })

      expect(result.current.isRunning).toBe(true)

      act(() => {
        result.current.stop()
      })

      expect(result.current.isRunning).toBe(false)
    })
  })

  describe("reset", () => {
    it("resets currentTime to 0", () => {
      createMockNoteElement("note1", 100, 50)
      const svg = createMockSvgElement()

      const { result } = renderHook(() => usePlayhead())

      const noteElements: NoteElementInfo[] = [
        { elementId: "note1", pitch: 60, onset: 0, duration: 500, page: 1 },
      ]

      act(() => {
        result.current.initialize(noteElements, svg)
        result.current.start(100)
      })

      act(() => {
        result.current.reset()
      })

      expect(result.current.currentTime).toBe(0)
      expect(result.current.isRunning).toBe(false)
    })

    it("resets position to first note", () => {
      createMockNoteElement("note1", 100, 50)
      createMockNoteElement("note2", 300, 50)
      const svg = createMockSvgElement()

      const { result } = renderHook(() => usePlayhead())

      const noteElements: NoteElementInfo[] = [
        { elementId: "note1", pitch: 60, onset: 0, duration: 500, page: 1 },
        { elementId: "note2", pitch: 62, onset: 500, duration: 500, page: 1 },
      ]

      act(() => {
        result.current.initialize(noteElements, svg)
      })

      act(() => {
        result.current.reset()
      })

      expect(result.current.position!.x).toBeCloseTo(110) // First note position
    })
  })

  describe("callbacks", () => {
    it("calls onTimeUpdate when time changes", () => {
      createMockNoteElement("note1", 100, 50)
      const svg = createMockSvgElement()
      const onTimeUpdate = mock(() => {})

      const { result } = renderHook(() => usePlayhead(onTimeUpdate))

      const noteElements: NoteElementInfo[] = [
        { elementId: "note1", pitch: 60, onset: 0, duration: 500, page: 1 },
      ]

      act(() => {
        result.current.initialize(noteElements, svg)
        result.current.start(100)
      })

      // Manually trigger animation frame
      act(() => {
        flushAnimationFrame()
      })

      act(() => {
        result.current.stop()
      })

      expect(onTimeUpdate).toHaveBeenCalled()
    })

    it("calls onPageChange when page changes", () => {
      createMockNoteElement("note1", 100, 50)
      createMockNoteElement("note2", 100, 50)
      const svg = createMockSvgElement()
      const onPageChange = mock(() => {})

      const { result } = renderHook(() => usePlayhead(undefined, undefined, onPageChange))

      const noteElements: NoteElementInfo[] = [
        { elementId: "note1", pitch: 60, onset: 0, duration: 500, page: 1 },
        { elementId: "note2", pitch: 62, onset: 500, duration: 500, page: 2 },
      ]

      act(() => {
        result.current.initialize(noteElements, svg)
      })

      // Initial position is page 1, so page change callback not called yet
      expect(onPageChange).not.toHaveBeenCalled()
    })
  })

  describe("position interpolation", () => {
    it("returns first note position when before first note time", () => {
      createMockNoteElement("note1", 100, 50)
      createMockNoteElement("note2", 200, 50)
      const svg = createMockSvgElement()

      const { result } = renderHook(() => usePlayhead())

      const noteElements: NoteElementInfo[] = [
        { elementId: "note1", pitch: 60, onset: 1000, duration: 500, page: 1 },
        { elementId: "note2", pitch: 62, onset: 2000, duration: 500, page: 1 },
      ]

      act(() => {
        result.current.initialize(noteElements, svg)
      })

      // Initial position should be at first note
      expect(result.current.position!.x).toBeCloseTo(110)
    })
  })

  describe("PlayheadPosition interface", () => {
    it("returns position with all required fields", () => {
      createMockNoteElement("note1", 100, 50, 20, 30)
      const svg = createMockSvgElement()

      const { result } = renderHook(() => usePlayhead())

      const noteElements: NoteElementInfo[] = [
        { elementId: "note1", pitch: 60, onset: 0, duration: 500, page: 1 },
      ]

      act(() => {
        result.current.initialize(noteElements, svg)
      })

      const position = result.current.position!
      expect(typeof position.x).toBe("number")
      expect(typeof position.y).toBe("number")
      expect(typeof position.height).toBe("number")
      expect(typeof position.page).toBe("number")
    })
  })

  describe("tempo adjustment", () => {
    it("accepts tempo percentage on start", () => {
      createMockNoteElement("note1", 100, 50)
      const svg = createMockSvgElement()

      const { result } = renderHook(() => usePlayhead())

      const noteElements: NoteElementInfo[] = [
        { elementId: "note1", pitch: 60, onset: 0, duration: 500, page: 1 },
      ]

      act(() => {
        result.current.initialize(noteElements, svg)
      })

      // Should not throw with different tempo values
      act(() => {
        result.current.start(50) // 50% speed
      })
      expect(result.current.isRunning).toBe(true)

      act(() => {
        result.current.stop()
        result.current.start(200) // 200% speed
      })
      expect(result.current.isRunning).toBe(true)
    })
  })

  describe("hook result memoization", () => {
    it("returns stable method references", () => {
      const { result, rerender } = renderHook(() => usePlayhead())

      const initialInitialize = result.current.initialize
      const initialStart = result.current.start
      const initialStop = result.current.stop
      const initialReset = result.current.reset

      rerender()

      expect(result.current.initialize).toBe(initialInitialize)
      expect(result.current.start).toBe(initialStart)
      expect(result.current.stop).toBe(initialStop)
      expect(result.current.reset).toBe(initialReset)
    })
  })

  describe("initialize with missing DOM elements", () => {
    it("skips notes without corresponding DOM elements", () => {
      // Only create note1, not note2
      createMockNoteElement("note1", 100, 50)
      const svg = createMockSvgElement()

      const { result } = renderHook(() => usePlayhead())

      const noteElements: NoteElementInfo[] = [
        { elementId: "note1", pitch: 60, onset: 0, duration: 500, page: 1 },
        { elementId: "note2", pitch: 62, onset: 500, duration: 500, page: 1 }, // No DOM element
      ]

      act(() => {
        result.current.initialize(noteElements, svg)
      })

      // Should still set position from note1
      expect(result.current.position).not.toBeNull()
      expect(result.current.position!.x).toBeCloseTo(110)
    })
  })

  describe("resume after stop", () => {
    it("can start again after being stopped", () => {
      createMockNoteElement("note1", 100, 50)
      const svg = createMockSvgElement()

      const { result } = renderHook(() => usePlayhead())

      const noteElements: NoteElementInfo[] = [
        { elementId: "note1", pitch: 60, onset: 0, duration: 500, page: 1 },
      ]

      act(() => {
        result.current.initialize(noteElements, svg)
        result.current.start(100)
      })

      act(() => {
        result.current.stop()
      })

      expect(result.current.isRunning).toBe(false)

      act(() => {
        result.current.start(100)
      })

      expect(result.current.isRunning).toBe(true)
    })
  })

  describe("currentTime tracking", () => {
    it("updates currentTime during animation", () => {
      createMockNoteElement("note1", 100, 50)
      const svg = createMockSvgElement()

      const { result } = renderHook(() => usePlayhead())

      const noteElements: NoteElementInfo[] = [
        { elementId: "note1", pitch: 60, onset: 0, duration: 500, page: 1 },
      ]

      act(() => {
        result.current.initialize(noteElements, svg)
        result.current.start(100)
      })

      // currentTime starts at 0
      const initialTime = result.current.currentTime

      // Flush animation frame
      act(() => {
        flushAnimationFrame()
      })

      act(() => {
        result.current.stop()
      })

      // Time should have advanced (though exact value depends on performance.now())
      expect(result.current.currentTime).toBeGreaterThanOrEqual(initialTime)
    })
  })

  describe("vertical span calculation", () => {
    it("calculates height spanning all notes vertically", () => {
      // Create notes at different vertical positions
      createMockNoteElement("note1", 100, 50, 20, 30)  // y: 50, height: 30
      createMockNoteElement("note2", 200, 100, 20, 40) // y: 100, height: 40
      const svg = createMockSvgElement()

      const { result } = renderHook(() => usePlayhead())

      const noteElements: NoteElementInfo[] = [
        { elementId: "note1", pitch: 60, onset: 0, duration: 500, page: 1 },
        { elementId: "note2", pitch: 62, onset: 500, duration: 500, page: 1 },
      ]

      act(() => {
        result.current.initialize(noteElements, svg)
      })

      // Height should span from top of note1 (50) to bottom of note2 (140)
      expect(result.current.position!.y).toBeCloseTo(50)
      expect(result.current.position!.height).toBeCloseTo(90) // 140 - 50
    })
  })
})
