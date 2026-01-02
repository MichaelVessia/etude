import { describe, expect, it, beforeEach, mock } from "bun:test"
import { renderHook, act, waitFor } from "@testing-library/react"
import {
  applyVerovioMocks,
  getMockToolkitInstance,
  resetMockToolkitInstance,
  mockCreateVerovioModule,
} from "./mocks/verovio.js"

// Apply mocks before importing the hook
applyVerovioMocks(mock.module)

// Import after mocks are applied
const { useVerovio } = await import("../useVerovio.js")

describe("useVerovio", () => {
  beforeEach(() => {
    resetMockToolkitInstance()
    mockCreateVerovioModule.mockClear()
  })

  describe("initialization", () => {
    it("starts in loading state", () => {
      const { result } = renderHook(() => useVerovio())

      expect(result.current.isLoading).toBe(true)
      expect(result.current.isReady).toBe(false)
      expect(result.current.error).toBeNull()
    })

    it("becomes ready after module loads", async () => {
      const { result } = renderHook(() => useVerovio())

      await waitFor(() => {
        expect(result.current.isReady).toBe(true)
      })

      expect(result.current.isLoading).toBe(false)
      expect(result.current.error).toBeNull()
    })

    it("applies initial options to toolkit", async () => {
      const initialOptions = { scale: 50, pageWidth: 1000 }
      const { result } = renderHook(() => useVerovio(initialOptions))

      await waitFor(() => {
        expect(result.current.isReady).toBe(true)
      })

      const toolkit = getMockToolkitInstance()
      expect(toolkit?.setOptions).toHaveBeenCalledWith(
        expect.objectContaining(initialOptions)
      )
    })

    it("handles module load error", async () => {
      mockCreateVerovioModule.mockImplementationOnce(() =>
        Promise.reject(new Error("WASM load failed"))
      )

      const { result } = renderHook(() => useVerovio())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.isReady).toBe(false)
      expect(result.current.error).toBe("Failed to load Verovio: WASM load failed")
    })
  })

  describe("loadMusicXml", () => {
    it("sets error if toolkit not ready", () => {
      const { result } = renderHook(() => useVerovio())

      // Call immediately before toolkit is ready
      act(() => {
        result.current.loadMusicXml("<score/>")
      })

      expect(result.current.error).toBe("Verovio not ready")
    })

    it("loads XML and renders SVG", async () => {
      const { result } = renderHook(() => useVerovio())

      await waitFor(() => {
        expect(result.current.isReady).toBe(true)
      })

      const toolkit = getMockToolkitInstance()!
      toolkit.getPageCount.mockReturnValue(3)
      toolkit.renderToSVG.mockReturnValue('<svg id="page1"></svg>')

      act(() => {
        result.current.loadMusicXml("<score/>")
      })

      expect(toolkit.loadData).toHaveBeenCalledWith("<score/>")
      expect(result.current.pageCount).toBe(3)
      expect(result.current.currentPage).toBe(1)
      expect(result.current.svg).toBe('<svg id="page1"></svg>')
      expect(result.current.error).toBeNull()
    })

    it("sets error on parse failure", async () => {
      const { result } = renderHook(() => useVerovio())

      await waitFor(() => {
        expect(result.current.isReady).toBe(true)
      })

      const toolkit = getMockToolkitInstance()!
      toolkit.loadData.mockReturnValue(false)

      act(() => {
        result.current.loadMusicXml("<invalid>")
      })

      expect(result.current.error).toBe("Failed to parse MusicXML")
    })

    it("handles loadData exception", async () => {
      const { result } = renderHook(() => useVerovio())

      await waitFor(() => {
        expect(result.current.isReady).toBe(true)
      })

      const toolkit = getMockToolkitInstance()!
      toolkit.loadData.mockImplementation(() => {
        throw new Error("Parse error")
      })

      act(() => {
        result.current.loadMusicXml("<invalid>")
      })

      expect(result.current.error).toBe("Error loading MusicXML: Parse error")
    })
  })

  describe("setPage", () => {
    it("changes page and renders new SVG", async () => {
      const { result } = renderHook(() => useVerovio())

      await waitFor(() => {
        expect(result.current.isReady).toBe(true)
      })

      const toolkit = getMockToolkitInstance()!
      toolkit.getPageCount.mockReturnValue(3)
      toolkit.renderToSVG.mockImplementation(
        (page) => `<svg id="page${page}"></svg>`
      )

      act(() => {
        result.current.loadMusicXml("<score/>")
      })

      expect(result.current.currentPage).toBe(1)

      act(() => {
        result.current.setPage(2)
      })

      expect(result.current.currentPage).toBe(2)
      expect(result.current.svg).toBe('<svg id="page2"></svg>')
    })

    it("ignores invalid page numbers", async () => {
      const { result } = renderHook(() => useVerovio())

      await waitFor(() => {
        expect(result.current.isReady).toBe(true)
      })

      const toolkit = getMockToolkitInstance()!
      toolkit.getPageCount.mockReturnValue(2)

      act(() => {
        result.current.loadMusicXml("<score/>")
      })

      act(() => {
        result.current.setPage(0) // too low
      })
      expect(result.current.currentPage).toBe(1)

      act(() => {
        result.current.setPage(5) // too high
      })
      expect(result.current.currentPage).toBe(1)
    })
  })

  describe("setOptions", () => {
    it("merges new options with existing", async () => {
      const { result } = renderHook(() => useVerovio({ scale: 40 }))

      await waitFor(() => {
        expect(result.current.isReady).toBe(true)
      })

      const toolkit = getMockToolkitInstance()!
      toolkit.setOptions.mockClear()

      act(() => {
        result.current.setOptions({ scale: 60 })
      })

      // Wait for effect to apply options
      await waitFor(() => {
        expect(toolkit.setOptions).toHaveBeenCalled()
      })

      expect(toolkit.setOptions).toHaveBeenCalledWith(
        expect.objectContaining({ scale: 60 })
      )
    })
  })

  describe("getMidiBase64", () => {
    it("returns null if toolkit not ready", () => {
      const { result } = renderHook(() => useVerovio())

      expect(result.current.getMidiBase64()).toBeNull()
    })

    it("returns MIDI data", async () => {
      const { result } = renderHook(() => useVerovio())

      await waitFor(() => {
        expect(result.current.isReady).toBe(true)
      })

      const toolkit = getMockToolkitInstance()!
      toolkit.renderToMIDI.mockReturnValue("base64MidiData")

      const midi = result.current.getMidiBase64()
      expect(midi).toBe("base64MidiData")
    })

    it("returns null on error", async () => {
      const { result } = renderHook(() => useVerovio())

      await waitFor(() => {
        expect(result.current.isReady).toBe(true)
      })

      const toolkit = getMockToolkitInstance()!
      toolkit.renderToMIDI.mockImplementation(() => {
        throw new Error("MIDI error")
      })

      expect(result.current.getMidiBase64()).toBeNull()
    })
  })

  describe("getTimeForElement", () => {
    it("returns null if toolkit not ready", () => {
      const { result } = renderHook(() => useVerovio())

      expect(result.current.getTimeForElement("note1")).toBeNull()
    })

    it("returns time for element", async () => {
      const { result } = renderHook(() => useVerovio())

      await waitFor(() => {
        expect(result.current.isReady).toBe(true)
      })

      const toolkit = getMockToolkitInstance()!
      toolkit.getTimeForElement.mockReturnValue(1500)

      expect(result.current.getTimeForElement("note1")).toBe(1500)
    })

    it("returns null on error", async () => {
      const { result } = renderHook(() => useVerovio())

      await waitFor(() => {
        expect(result.current.isReady).toBe(true)
      })

      const toolkit = getMockToolkitInstance()!
      toolkit.getTimeForElement.mockImplementation(() => {
        throw new Error("Element not found")
      })

      expect(result.current.getTimeForElement("invalid")).toBeNull()
    })
  })

  describe("getPageForElement", () => {
    it("returns 1 if toolkit not ready", () => {
      const { result } = renderHook(() => useVerovio())

      expect(result.current.getPageForElement("note1")).toBe(1)
    })

    it("returns page number for element", async () => {
      const { result } = renderHook(() => useVerovio())

      await waitFor(() => {
        expect(result.current.isReady).toBe(true)
      })

      const toolkit = getMockToolkitInstance()!
      toolkit.getPageWithElement.mockReturnValue(2)

      expect(result.current.getPageForElement("note1")).toBe(2)
    })

    it("returns 1 on error", async () => {
      const { result } = renderHook(() => useVerovio())

      await waitFor(() => {
        expect(result.current.isReady).toBe(true)
      })

      const toolkit = getMockToolkitInstance()!
      toolkit.getPageWithElement.mockImplementation(() => {
        throw new Error("Element not found")
      })

      expect(result.current.getPageForElement("invalid")).toBe(1)
    })
  })

  describe("getNoteElements", () => {
    it("returns empty array if toolkit not ready", () => {
      const { result } = renderHook(() => useVerovio())

      expect(result.current.getNoteElements()).toEqual([])
    })

    it("returns empty array if no SVG loaded", async () => {
      const { result } = renderHook(() => useVerovio())

      await waitFor(() => {
        expect(result.current.isReady).toBe(true)
      })

      expect(result.current.getNoteElements()).toEqual([])
    })

    it("parses notes from SVG", async () => {
      const { result } = renderHook(() => useVerovio())

      await waitFor(() => {
        expect(result.current.isReady).toBe(true)
      })

      const toolkit = getMockToolkitInstance()!
      toolkit.renderToSVG.mockReturnValue(`
        <svg>
          <g id="note1" class="note"></g>
          <g id="note2" class="note"></g>
        </svg>
      `)
      toolkit.getMIDIValuesForElement.mockImplementation((id) => {
        if (id === "note1") return { pitch: 60, time: 0, duration: 500 }
        if (id === "note2") return { pitch: 62, time: 500, duration: 500 }
        return null
      })
      toolkit.getPageWithElement.mockReturnValue(1)

      act(() => {
        result.current.loadMusicXml("<score/>")
      })

      const notes = result.current.getNoteElements()
      expect(notes).toHaveLength(2)
      expect(notes[0]).toEqual({
        elementId: "note1",
        pitch: 60,
        onset: 0,
        duration: 500,
        page: 1,
      })
      expect(notes[1]).toEqual({
        elementId: "note2",
        pitch: 62,
        onset: 500,
        duration: 500,
        page: 1,
      })
    })

    it("skips elements without MIDI values", async () => {
      const { result } = renderHook(() => useVerovio())

      await waitFor(() => {
        expect(result.current.isReady).toBe(true)
      })

      const toolkit = getMockToolkitInstance()!
      toolkit.renderToSVG.mockReturnValue(`
        <svg>
          <g id="note1" class="note"></g>
          <g id="rest1" class="note"></g>
        </svg>
      `)
      toolkit.getMIDIValuesForElement.mockImplementation((id) => {
        if (id === "note1") return { pitch: 60, time: 0, duration: 500 }
        // rest1 throws - no MIDI values
        throw new Error("No MIDI values")
      })

      act(() => {
        result.current.loadMusicXml("<score/>")
      })

      const notes = result.current.getNoteElements()
      expect(notes).toHaveLength(1)
      expect(notes[0].elementId).toBe("note1")
    })

    it("skips elements without id", async () => {
      const { result } = renderHook(() => useVerovio())

      await waitFor(() => {
        expect(result.current.isReady).toBe(true)
      })

      const toolkit = getMockToolkitInstance()!
      toolkit.renderToSVG.mockReturnValue(`
        <svg>
          <g id="note1" class="note"></g>
          <g class="note"></g>
        </svg>
      `)
      toolkit.getMIDIValuesForElement.mockReturnValue({
        pitch: 60,
        time: 0,
        duration: 500,
      })

      act(() => {
        result.current.loadMusicXml("<score/>")
      })

      const notes = result.current.getNoteElements()
      expect(notes).toHaveLength(1)
    })
  })
})
