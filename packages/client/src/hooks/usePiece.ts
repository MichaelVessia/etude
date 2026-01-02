import { useState, useEffect } from "react"

export interface StoredPiece {
  id: string
  title: string
  composer: string
  path: string
  xml: string
  measures?: number
}

export interface UsePieceResult {
  piece: StoredPiece | null
  error: string | null
}

/**
 * Load a piece from sessionStorage by route param ID
 */
export function usePiece(paramId: string | undefined): UsePieceResult {
  const [piece, setPiece] = useState<StoredPiece | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const stored = sessionStorage.getItem("etude:currentPiece")
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as StoredPiece
        if (parsed.id === paramId || paramId?.startsWith("custom-")) {
          setPiece(parsed)
        } else {
          setError("Piece not found")
        }
      } catch {
        setError("Failed to load piece data")
      }
    } else {
      setError("No piece selected")
    }
  }, [paramId])

  return { piece, error }
}
