import { describe, expect, it, beforeEach, afterEach } from "bun:test"
import { renderHook } from "@testing-library/react"
import { usePiece } from "../usePiece.js"
import type { StoredPiece } from "../usePiece.js"

const mockPiece: StoredPiece = {
  id: "piece-123",
  title: "Moonlight Sonata",
  composer: "Beethoven",
  path: "/pieces/moonlight.xml",
  xml: "<score>...</score>",
  measures: 200,
}

describe("usePiece", () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  afterEach(() => {
    sessionStorage.clear()
  })

  describe("when piece is in sessionStorage", () => {
    it("returns piece when paramId matches stored piece id", () => {
      sessionStorage.setItem("etude:currentPiece", JSON.stringify(mockPiece))

      const { result } = renderHook(() => usePiece("piece-123"))

      expect(result.current.piece).toEqual(mockPiece)
      expect(result.current.error).toBeNull()
    })

    it("returns piece when paramId starts with custom-", () => {
      const customPiece = { ...mockPiece, id: "custom-abc" }
      sessionStorage.setItem("etude:currentPiece", JSON.stringify(customPiece))

      const { result } = renderHook(() => usePiece("custom-different"))

      expect(result.current.piece).toEqual(customPiece)
      expect(result.current.error).toBeNull()
    })

    it("returns error when paramId does not match stored piece id", () => {
      sessionStorage.setItem("etude:currentPiece", JSON.stringify(mockPiece))

      const { result } = renderHook(() => usePiece("different-id"))

      expect(result.current.piece).toBeNull()
      expect(result.current.error).toBe("Piece not found")
    })
  })

  describe("when no piece in sessionStorage", () => {
    it("returns error when sessionStorage is empty", () => {
      const { result } = renderHook(() => usePiece("piece-123"))

      expect(result.current.piece).toBeNull()
      expect(result.current.error).toBe("No piece selected")
    })
  })

  describe("when sessionStorage has invalid data", () => {
    it("returns error when stored data is invalid JSON", () => {
      sessionStorage.setItem("etude:currentPiece", "not valid json")

      const { result } = renderHook(() => usePiece("piece-123"))

      expect(result.current.piece).toBeNull()
      expect(result.current.error).toBe("Failed to load piece data")
    })
  })

  describe("paramId variations", () => {
    it("handles undefined paramId", () => {
      sessionStorage.setItem("etude:currentPiece", JSON.stringify(mockPiece))

      const { result } = renderHook(() => usePiece(undefined))

      expect(result.current.piece).toBeNull()
      expect(result.current.error).toBe("Piece not found")
    })

    it("sets error when paramId changes to non-matching id", () => {
      sessionStorage.setItem("etude:currentPiece", JSON.stringify(mockPiece))

      const { result, rerender } = renderHook(
        ({ id }) => usePiece(id),
        { initialProps: { id: "piece-123" } }
      )

      expect(result.current.piece).toEqual(mockPiece)
      expect(result.current.error).toBeNull()

      rerender({ id: "different-id" })

      // Note: piece state is not cleared, only error is set
      expect(result.current.error).toBe("Piece not found")
    })

    it("loads piece when paramId changes to matching id", () => {
      const { result, rerender } = renderHook(
        ({ id }) => usePiece(id),
        { initialProps: { id: "nonexistent" } }
      )

      expect(result.current.piece).toBeNull()
      expect(result.current.error).toBe("No piece selected")

      // Add piece to storage and change paramId
      sessionStorage.setItem("etude:currentPiece", JSON.stringify(mockPiece))
      rerender({ id: "piece-123" })

      expect(result.current.piece).toEqual(mockPiece)
    })
  })

  describe("StoredPiece fields", () => {
    it("handles piece without optional measures field", () => {
      const pieceWithoutMeasures: StoredPiece = {
        id: "piece-456",
        title: "Clair de Lune",
        composer: "Debussy",
        path: "/pieces/clair.xml",
        xml: "<score>...</score>",
      }
      sessionStorage.setItem(
        "etude:currentPiece",
        JSON.stringify(pieceWithoutMeasures)
      )

      const { result } = renderHook(() => usePiece("piece-456"))

      expect(result.current.piece).toEqual(pieceWithoutMeasures)
      expect(result.current.piece?.measures).toBeUndefined()
      expect(result.current.error).toBeNull()
    })
  })
})
