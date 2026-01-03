import { describe, expect, it } from "bun:test"
import { render } from "@testing-library/react"
import { ExtraNoteIndicators } from "../PlayedNoteIndicators.js"
import type { ExtraNoteIndicator } from "../../hooks/usePlayedNotes.js"

describe("ExtraNoteIndicators", () => {
  it("renders nothing when notes array is empty", () => {
    const { container } = render(<ExtraNoteIndicators notes={[]} />)

    const indicators = container.querySelectorAll("svg")
    expect(indicators.length).toBe(0)
  })

  it("renders indicators for each note", () => {
    const notes: ExtraNoteIndicator[] = [
      { id: "note1", x: 100, y: 50, pitch: 60 },
      { id: "note2", x: 200, y: 75, pitch: 62 },
      { id: "note3", x: 300, y: 100, pitch: 64 },
    ]

    const { container } = render(<ExtraNoteIndicators notes={notes} />)

    const indicators = container.querySelectorAll("svg")
    expect(indicators.length).toBe(3)
  })

  it("positions indicators with style attributes", () => {
    const notes: ExtraNoteIndicator[] = [
      { id: "note1", x: 150, y: 80, pitch: 60 },
    ]

    const { container } = render(<ExtraNoteIndicators notes={notes} />)

    // Structure: container > div.container > div.extraIndicator[style]
    // The indicator with inline styles contains the SVG
    const indicatorWithSvg = container.querySelector("div[style]")
    expect(indicatorWithSvg).not.toBeNull()
    const style = indicatorWithSvg?.getAttribute("style") ?? ""
    expect(style).toContain("left: 150px")
    expect(style).toContain("top: 80px")
  })

  it("uses default size when noteSize is not provided", () => {
    const notes: ExtraNoteIndicator[] = [
      { id: "note1", x: 100, y: 50, pitch: 60 },
    ]

    const { container } = render(<ExtraNoteIndicators notes={notes} />)

    const indicatorWithSvg = container.querySelector("div[style]")
    expect(indicatorWithSvg).not.toBeNull()
    // Default width: 14, height: 10
    const style = indicatorWithSvg?.getAttribute("style") ?? ""
    expect(style).toContain("width: 14px")
    expect(style).toContain("height: 10px")
  })

  it("uses custom noteSize when provided", () => {
    const notes: ExtraNoteIndicator[] = [
      { id: "note1", x: 100, y: 50, pitch: 60 },
    ]
    const noteSize = { width: 20, height: 15 }

    const { container } = render(
      <ExtraNoteIndicators notes={notes} noteSize={noteSize} />
    )

    const indicatorWithSvg = container.querySelector("div[style]")
    expect(indicatorWithSvg).not.toBeNull()
    const style = indicatorWithSvg?.getAttribute("style") ?? ""
    expect(style).toContain("width: 20px")
    expect(style).toContain("height: 15px")
  })

  it("renders ellipse note head SVG", () => {
    const notes: ExtraNoteIndicator[] = [
      { id: "note1", x: 100, y: 50, pitch: 60 },
    ]

    const { container } = render(<ExtraNoteIndicators notes={notes} />)

    const ellipse = container.querySelector("ellipse")
    expect(ellipse).not.toBeNull()
    expect(ellipse?.getAttribute("cx")).toBe("12")
    expect(ellipse?.getAttribute("cy")).toBe("10")
  })

  it("renders each indicator with unique key based on note id", () => {
    const notes: ExtraNoteIndicator[] = [
      { id: "unique-1", x: 100, y: 50, pitch: 60 },
      { id: "unique-2", x: 200, y: 75, pitch: 62 },
    ]

    const { container } = render(<ExtraNoteIndicators notes={notes} />)

    // Should render without key warnings
    const indicators = container.querySelectorAll("svg")
    expect(indicators.length).toBe(2)
  })
})
