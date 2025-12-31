import { useState } from "react"

interface PieceInfo {
  id: string
  title: string
  composer: string
  path: string
}

const bundledPieces: PieceInfo[] = [
  { id: "c-major-scale", title: "C Major Scale", composer: "Exercise", path: "/pieces/c-major-scale.xml" },
  { id: "twinkle", title: "Twinkle Twinkle Little Star", composer: "Traditional", path: "/pieces/twinkle.xml" },
  { id: "simple-melody", title: "Simple Melody", composer: "Test", path: "/pieces/simple-melody.xml" },
]

interface PieceLibraryProps {
  onSelect: (musicXml: string) => void
}

export function PieceLibrary({ onSelect }: PieceLibraryProps) {
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadPiece = async (piece: PieceInfo) => {
    setLoading(piece.id)
    setError(null)

    try {
      const response = await fetch(piece.path)
      if (!response.ok) {
        throw new Error(`Failed to load: ${response.statusText}`)
      }
      const xml = await response.text()
      onSelect(xml)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load piece")
    } finally {
      setLoading(null)
    }
  }

  return (
    <div>
      <h3 style={{ margin: "0 0 0.5rem 0" }}>Starter Pieces</h3>
      {error && (
        <div style={{ color: "red", marginBottom: "0.5rem", fontSize: "0.875rem" }}>{error}</div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {bundledPieces.map((piece) => (
          <button
            key={piece.id}
            onClick={() => loadPiece(piece)}
            disabled={loading !== null}
            style={{
              padding: "0.75rem",
              textAlign: "left",
              background: "#f5f5f5",
              border: "1px solid #ddd",
              borderRadius: "4px",
              cursor: loading ? "wait" : "pointer",
            }}
          >
            <div style={{ fontWeight: "500" }}>{piece.title}</div>
            <div style={{ fontSize: "0.875rem", color: "#666" }}>{piece.composer}</div>
            {loading === piece.id && <span style={{ fontSize: "0.875rem" }}> Loading...</span>}
          </button>
        ))}
      </div>
    </div>
  )
}
