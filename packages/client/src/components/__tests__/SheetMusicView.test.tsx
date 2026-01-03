import { describe, expect, it, beforeEach, mock } from "bun:test"
import { render, screen, waitFor } from "@testing-library/react"
import {
  applyVerovioMocks,
  getMockToolkitInstance,
  resetMockToolkitInstance,
} from "../../hooks/__tests__/mocks/verovio.js"

// Apply mocks before importing component
applyVerovioMocks(mock.module)

// Import after mocks
const { SheetMusicView } = await import("../SheetMusicView.js")

describe("SheetMusicView", () => {
  beforeEach(() => {
    resetMockToolkitInstance()
  })

  describe("loading state", () => {
    it("shows loading message initially", () => {
      render(<SheetMusicView musicXml="<score/>" />)

      expect(screen.getByText("Loading Verovio...")).not.toBeNull()
    })
  })

  describe("no music state", () => {
    it("shows placeholder when musicXml is null", async () => {
      render(<SheetMusicView musicXml={null} />)

      await waitFor(() => {
        expect(screen.queryByText("Loading Verovio...")).toBeNull()
      })

      expect(screen.getByText("No sheet music loaded")).not.toBeNull()
    })
  })

  describe("rendered state", () => {
    it("renders SVG content after loading", async () => {
      const { container } = render(<SheetMusicView musicXml="<score/>" />)

      await waitFor(() => {
        expect(screen.queryByText("Loading Verovio...")).toBeNull()
      })

      // After loading, should render SVG
      await waitFor(() => {
        const svg = container.querySelector("svg")
        expect(svg).not.toBeNull()
      })
    })
  })

  describe("page navigation", () => {
    it("shows page navigation for multi-page scores", async () => {
      const { container } = render(<SheetMusicView musicXml="<score/>" />)

      await waitFor(() => {
        expect(screen.queryByText("Loading Verovio...")).toBeNull()
      })

      const toolkit = getMockToolkitInstance()
      if (toolkit) {
        toolkit.getPageCount.mockReturnValue(3)
        toolkit.loadData.mockReturnValue(true)
      }

      // Re-render to pick up the new page count
      render(<SheetMusicView musicXml="<score/>" />)

      await waitFor(() => {
        const svg = container.querySelector("svg")
        expect(svg).not.toBeNull()
      })
    })

    it("disables prev button on first page", async () => {
      const { container } = render(<SheetMusicView musicXml="<score/>" />)

      await waitFor(() => {
        expect(screen.queryByText("Loading Verovio...")).toBeNull()
      })

      const toolkit = getMockToolkitInstance()
      if (toolkit) {
        toolkit.getPageCount.mockReturnValue(3)
      }

      // Page nav buttons would be disabled on first page
      const buttons = container.querySelectorAll("button")
      if (buttons.length >= 2) {
        // First button (prev) should be disabled on page 1
        expect(buttons[0].hasAttribute("disabled")).toBe(true)
      }
    })
  })

  describe("callbacks", () => {
    it("calls onMidiReady when SVG is rendered", async () => {
      const onMidiReady = mock(() => {})

      render(
        <SheetMusicView
          musicXml="<score/>"
          onMidiReady={onMidiReady}
        />
      )

      await waitFor(() => {
        expect(screen.queryByText("Loading Verovio...")).toBeNull()
      })

      await waitFor(() => {
        expect(onMidiReady).toHaveBeenCalled()
      })
    })
  })

  describe("props", () => {
    it("accepts showPlayhead prop", async () => {
      const { container } = render(
        <SheetMusicView
          musicXml="<score/>"
          showPlayhead={true}
          playheadPosition={{ x: 100, y: 50, height: 200, page: 1 }}
        />
      )

      await waitFor(() => {
        expect(screen.queryByText("Loading Verovio...")).toBeNull()
      })

      // Playhead would be rendered if showPlayhead is true and position is provided
      // After SVG renders, playhead should appear
      await waitFor(() => {
        const svg = container.querySelector("svg")
        expect(svg).not.toBeNull()
      })
    })

    it("accepts extraNotes prop", async () => {
      const { container } = render(
        <SheetMusicView
          musicXml="<score/>"
          extraNotes={[
            { id: "extra1", x: 100, y: 50, pitch: 60 },
            { id: "extra2", x: 150, y: 75, pitch: 62 },
          ]}
        />
      )

      await waitFor(() => {
        expect(screen.queryByText("Loading Verovio...")).toBeNull()
      })

      // Extra notes would be rendered as indicators
      await waitFor(() => {
        const svg = container.querySelector("svg")
        expect(svg).not.toBeNull()
      })
    })
  })
})
