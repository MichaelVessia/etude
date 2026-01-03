import { describe, expect, it, afterEach } from "bun:test"
import { render, screen, cleanup } from "@testing-library/react"
import { CountdownOverlay } from "../CountdownOverlay.js"

describe("CountdownOverlay", () => {
  afterEach(() => {
    cleanup()
  })

  describe("rendering", () => {
    it("renders countdown value", () => {
      render(<CountdownOverlay value={3} />)

      expect(screen.getByText("3")).toBeTruthy()
    })

    it("renders hint text", () => {
      render(<CountdownOverlay value={3} />)

      expect(screen.getByText("Get ready to play...")).toBeTruthy()
    })

    it("updates when value changes", () => {
      const { rerender } = render(<CountdownOverlay value={3} />)

      expect(screen.getByText("3")).toBeTruthy()

      rerender(<CountdownOverlay value={2} />)

      expect(screen.getByText("2")).toBeTruthy()
      expect(screen.queryByText("3")).toBeNull()
    })

    it("renders value of 1", () => {
      render(<CountdownOverlay value={1} />)

      expect(screen.getByText("1")).toBeTruthy()
    })

    it("renders value of 0", () => {
      render(<CountdownOverlay value={0} />)

      expect(screen.getByText("0")).toBeTruthy()
    })
  })
})
