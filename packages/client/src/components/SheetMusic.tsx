import { useVerovio, type NoteElementInfo } from "../hooks/index.js"
import { useEffect } from "react"

interface SheetMusicProps {
  musicXml: string | null
  scale?: number
  onMidiReady?: (midiBase64: string | null) => void
  onNoteElementsReady?: (noteElements: NoteElementInfo[]) => void
}

export function SheetMusic({ musicXml, scale = 40, onMidiReady, onNoteElementsReady }: SheetMusicProps) {
  const { isReady, isLoading, error, svg, pageCount, currentPage, setPage, loadMusicXml, getMidiBase64, getNoteElements } = useVerovio({
    scale,
  })

  useEffect(() => {
    if (musicXml && isReady) {
      loadMusicXml(musicXml)
    }
  }, [musicXml, isReady, loadMusicXml])

  // Notify parent when MIDI is ready
  useEffect(() => {
    if (svg && onMidiReady) {
      onMidiReady(getMidiBase64())
    }
  }, [svg, onMidiReady, getMidiBase64])

  // Notify parent when note elements are ready for coloring
  useEffect(() => {
    if (svg && onNoteElementsReady) {
      // Slight delay to ensure SVG is rendered in DOM
      const timer = setTimeout(() => {
        const noteElements = getNoteElements()
        onNoteElementsReady(noteElements)
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [svg, onNoteElementsReady, getNoteElements])

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
