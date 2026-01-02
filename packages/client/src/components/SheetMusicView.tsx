import { useVerovio, type NoteElementInfo } from "../hooks/index.js"
import { useEffect, useRef } from "react"
import { Playhead } from "./Playhead.js"
import type { PlayheadPosition } from "../hooks/usePlayhead.js"
import styles from "./SheetMusicView.module.css"

interface SheetMusicViewProps {
  musicXml: string | null
  onMidiReady?: (midiBase64: string | null) => void
  onNoteElementsReady?: (noteElements: NoteElementInfo[], svgElement: SVGElement | null) => void
  playheadPosition?: PlayheadPosition | null
  showPlayhead?: boolean
  page?: number | undefined
}

export function SheetMusicView({
  musicXml,
  onMidiReady,
  onNoteElementsReady,
  playheadPosition,
  showPlayhead = false,
  page,
}: SheetMusicViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const noteElementsInitializedRef = useRef(false)
  const lastMusicXmlRef = useRef<string | null>(null)

  const {
    isReady,
    isLoading,
    error,
    svg,
    pageCount,
    currentPage,
    setPage,
    loadMusicXml,
    getMidiBase64,
    getNoteElements
  } = useVerovio({
    scale: 50, // Larger scale for full-screen view
  })

  useEffect(() => {
    if (musicXml && isReady) {
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

  // Notify parent when note elements are ready for coloring
  useEffect(() => {
    if (!svg || !onNoteElementsReady || noteElementsInitializedRef.current) {
      return
    }

    noteElementsInitializedRef.current = true

    const timer = setTimeout(() => {
      const noteElements = getNoteElements()
      const svgElement = containerRef.current?.querySelector("svg") ?? null
      onNoteElementsReady(noteElements, svgElement)
    }, 100)

    return () => clearTimeout(timer)
  }, [svg, onNoteElementsReady, getNoteElements])

  if (isLoading) {
    return (
      <div className={styles.placeholder}>
        <div className={styles.spinner} />
        <span>Loading Verovio...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className={styles.error}>
        <span className={styles.errorIcon}>!</span>
        <span>{error}</span>
      </div>
    )
  }

  if (!musicXml) {
    return (
      <div className={styles.placeholder}>
        <span>No sheet music loaded</span>
      </div>
    )
  }

  if (!svg) {
    return (
      <div className={styles.placeholder}>
        <div className={styles.spinner} />
        <span>Rendering...</span>
      </div>
    )
  }

  return (
    <div className={styles.wrapper}>
      {/* Page Navigation */}
      {pageCount > 1 && (
        <div className={styles.pageNav}>
          <button
            className={styles.pageButton}
            onClick={() => setPage(currentPage - 1)}
            disabled={currentPage <= 1}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <span className={styles.pageIndicator}>
            {currentPage} / {pageCount}
          </span>
          <button
            className={styles.pageButton}
            onClick={() => setPage(currentPage + 1)}
            disabled={currentPage >= pageCount}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      )}

      {/* Sheet Music Container */}
      <div
        ref={containerRef}
        className={styles.sheetContainer}
      >
        <div
          className={styles.svgWrapper}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        {showPlayhead && playheadPosition && (
          <Playhead
            x={playheadPosition.x + 32} /* Account for svgWrapper padding (space-8 = 2rem = 32px) */
            y={playheadPosition.y + 32}
            height={playheadPosition.height}
            visible={true}
          />
        )}
      </div>
    </div>
  )
}
