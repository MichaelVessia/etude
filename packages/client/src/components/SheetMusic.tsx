import { useVerovio } from "../hooks/index.js"
import { useEffect } from "react"

interface SheetMusicProps {
  musicXml: string | null
  scale?: number
}

export function SheetMusic({ musicXml, scale = 40 }: SheetMusicProps) {
  const { isReady, isLoading, error, svg, pageCount, currentPage, setPage, loadMusicXml } = useVerovio({ scale })

  useEffect(() => {
    if (musicXml && isReady) {
      loadMusicXml(musicXml)
    }
  }, [musicXml, isReady, loadMusicXml])

  if (isLoading) {
    return <div style={{ padding: "1rem", color: "#666" }}>Loading Verovio...</div>
  }

  if (error) {
    return (
      <div style={{ padding: "1rem", color: "red", background: "#fee" }}>
        Error: {error}
      </div>
    )
  }

  if (!musicXml) {
    return <div style={{ padding: "1rem", color: "#666" }}>No sheet music loaded</div>
  }

  if (!svg) {
    return <div style={{ padding: "1rem", color: "#666" }}>Rendering...</div>
  }

  return (
    <div>
      {pageCount > 1 && (
        <div style={{ marginBottom: "0.5rem" }}>
          <button
            onClick={() => setPage(currentPage - 1)}
            disabled={currentPage <= 1}
            style={{ marginRight: "0.5rem" }}
          >
            Previous
          </button>
          <span>
            Page {currentPage} of {pageCount}
          </span>
          <button
            onClick={() => setPage(currentPage + 1)}
            disabled={currentPage >= pageCount}
            style={{ marginLeft: "0.5rem" }}
          >
            Next
          </button>
        </div>
      )}
      <div
        dangerouslySetInnerHTML={{ __html: svg }}
        style={{ background: "#fff", borderRadius: "4px", overflow: "auto" }}
      />
    </div>
  )
}
