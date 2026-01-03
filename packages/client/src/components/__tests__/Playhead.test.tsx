import { describe, expect, it } from "bun:test"
import { render } from "@testing-library/react"
import { Playhead } from "../Playhead.js"

describe("Playhead", () => {
  it("renders when visible is true", () => {
    const { container } = render(
      <Playhead x={100} y={50} height={200} visible={true} />
    )

    const playhead = container.firstChild as HTMLElement
    expect(playhead).not.toBeNull()
    expect(playhead.style.left).toBe("100px")
    expect(playhead.style.top).toBe("50px")
    expect(playhead.style.height).toBe("200px")
    expect(playhead.style.width).toBe("2px")
  })

  it("returns null when visible is false", () => {
    const { container } = render(
      <Playhead x={100} y={50} height={200} visible={false} />
    )

    expect(container.firstChild).toBeNull()
  })

  it("positions at correct coordinates", () => {
    const { container } = render(
      <Playhead x={250} y={100} height={150} visible={true} />
    )

    const playhead = container.firstChild as HTMLElement
    expect(playhead.style.position).toBe("absolute")
    expect(playhead.style.left).toBe("250px")
    expect(playhead.style.top).toBe("100px")
    expect(playhead.style.height).toBe("150px")
  })

  it("has correct styling", () => {
    const { container } = render(
      <Playhead x={0} y={0} height={100} visible={true} />
    )

    const playhead = container.firstChild as HTMLElement
    expect(playhead.style.pointerEvents).toBe("none")
    expect(playhead.style.zIndex).toBe("10")
    expect(playhead.style.backgroundColor).toBe("rgba(37, 99, 235, 0.8)")
  })
})
