import { useVerovio, type NoteElementInfo } from "../hooks/index.js"
import { useEffect, useRef } from "react"
import { Playhead } from "./Playhead.js"
import type { PlayheadPosition } from "../hooks/usePlayhead.js"

interface SheetMusicProps {
  musicXml: string | null
  scale?: number
  onMidiReady?: (midiBase64: string | null) => void
  onNoteElementsReady?: (noteElements: NoteElementInfo[], svgElement: SVGElement | null) => void
  playheadPosition?: PlayheadPosition | null
  showPlayhead?: boolean
  /** Controlled page number (1-indexed). When set, overrides internal page state. */
  page?: number
}

export function SheetMusic({ musicXml, scale = 40, onMidiReady, onNoteElementsReady, playheadPosition, showPlayhead = false, page }: SheetMusicProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  // Use ref instead of state to prevent re-render loops
  const noteElementsInitializedRef = useRef(false)
  const lastMusicXmlRef = useRef<string | null>(null)
  const { isReady, isLoading, error, svg, pageCount, currentPage, setPage, loadMusicXml, getMidiBase64, getNoteElements } = useVerovio({
    scale,
  })

  useEffect(() => {
    if (musicXml && isReady) {
      // Reset initialization flag when loading new music
      if (musicXml !== lastMusicXmlRef.current) {
        noteElementsInitializedRef.current = false
        lastMusicXmlRef.current = musicXml
      }
      loadMusicXml(musicXml)
    }
  }, [musicXml, isReady, loadMusicXml])

  // Sync controlled page prop with internal state
  useEffect(() => {
    if (page !== undefined && page !== currentPage && page >= 1 && page <= pageCount) {
      setPage(page)
    }
  }, [page, currentPage, pageCount, setPage])

  // Notify parent when MIDI is ready
  useEffect(() => {
    if (svg && onMidiReady) {
      onMidiReady(getMidiBase64())
    }
  }, [svg, onMidiReady, getMidiBase64])

  // Notify parent when note elements are ready for coloring (only once per music load)
  // Using refs to prevent re-render loops - check ref BEFORE scheduling, set ref INSIDE timeout
  useEffect(() => {
    // Check ref immediately - if already initialized, skip everything
    if (!svg || !onNoteElementsReady || noteElementsInitializedRef.current) {
      return
    }

    // Mark as initialized BEFORE setTimeout to prevent race conditions
    noteElementsInitializedRef.current = true

    // Slight delay to ensure SVG is rendered in DOM
    const timer = setTimeout(() => {
      const noteElements = getNoteElements()
      const svgElement = containerRef.current?.querySelector("svg") ?? null
      onNoteElementsReady(noteElements, svgElement)
    }, 100)

    return () => clearTimeout(timer)
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
        ref={containerRef}
        style={{ position: "relative", background: "#fff", borderRadius: "4px", overflow: "auto" }}
      >
        <div dangerouslySetInnerHTML={{ __html: svg }} />
        {showPlayhead && playheadPosition && (
          <Playhead
            x={playheadPosition.x}
            y={playheadPosition.y}
            height={playheadPosition.height}
            visible={true}
          />
        )}
      </div>
    </div>
  )
}
