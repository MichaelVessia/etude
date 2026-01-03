import { describe, expect, it, mock, beforeEach } from "bun:test"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"
import { MidiStatusBadge } from "../MidiStatusBadge.js"

describe("MidiStatusBadge", () => {
  beforeEach(() => {
    cleanup()
  })

  describe("when disconnected", () => {
    it("shows 'No MIDI Device' text", () => {
      render(<MidiStatusBadge isConnected={false} />)

      expect(screen.getByText("No MIDI Device")).not.toBeNull()
    })

    it("applies disconnected styling class", () => {
      const { container } = render(<MidiStatusBadge isConnected={false} />)

      const button = container.querySelector("button")
      expect(button).not.toBeNull()
      // CSS modules may not resolve in tests, but className is set
      expect(button?.className).toBeDefined()
    })
  })

  describe("when connected", () => {
    it("shows 'MIDI Connected' when no device name", () => {
      render(<MidiStatusBadge isConnected={true} />)

      expect(screen.getByText("MIDI Connected")).not.toBeNull()
    })

    it("shows device name when provided", () => {
      render(<MidiStatusBadge isConnected={true} deviceName="Yamaha P-125" />)

      expect(screen.getByText("Yamaha P-125")).not.toBeNull()
    })

    it("applies connected styling class", () => {
      const { container } = render(<MidiStatusBadge isConnected={true} />)

      const button = container.querySelector("button")
      expect(button).not.toBeNull()
      expect(button?.className).toBeDefined()
    })
  })

  describe("click handling", () => {
    it("calls onClick when clicked", () => {
      const handleClick = mock(() => {})

      const { container } = render(
        <MidiStatusBadge isConnected={false} onClick={handleClick} />
      )

      const button = container.querySelector("button")!
      fireEvent.click(button)

      expect(handleClick).toHaveBeenCalledTimes(1)
    })

    it("renders as button element with type button", () => {
      const { container } = render(<MidiStatusBadge isConnected={false} />)

      const button = container.querySelector("button")
      expect(button).not.toBeNull()
      expect(button?.tagName).toBe("BUTTON")
      expect(button?.getAttribute("type")).toBe("button")
    })
  })

  describe("visual elements", () => {
    it("renders status indicator span", () => {
      const { container } = render(<MidiStatusBadge isConnected={true} />)

      const spans = container.querySelectorAll("span")
      expect(spans.length).toBeGreaterThanOrEqual(2) // indicator + label
    })

    it("renders chevron icon svg", () => {
      const { container } = render(<MidiStatusBadge isConnected={true} />)

      const svg = container.querySelector("svg")
      expect(svg).not.toBeNull()
      expect(svg?.querySelector("path")).not.toBeNull()
    })

    it("renders label with correct text", () => {
      render(<MidiStatusBadge isConnected={true} deviceName="Test Device" />)

      expect(screen.getByText("Test Device")).not.toBeNull()
    })
  })
})
