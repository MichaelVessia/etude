import { useCallback, useState, useRef, useEffect, useLayoutEffect } from "react"
import { useLocation, useParams } from "wouter"
import { SheetMusicView, type PageInfo } from "../components/SheetMusicView.js"
import { PracticeControls } from "../components/PracticeControls.js"
import { ResultsOverlay } from "../components/ResultsOverlay.js"
import { MidiSimulator } from "../components/dev/MidiSimulator.js"
import {
  type NoteElementInfo,
  useSession,
  useNoteColoring,
  usePlayhead,
  usePiece,
  useExtraNotes,
  type UseMidiResult,
} from "../hooks/index.js"
import styles from "./Practice.module.css"

interface PracticeProps {
  midi: UseMidiResult
}

export function Practice({ midi }: PracticeProps) {
  const [, navigate] = useLocation()
  const params = useParams<{ id: string }>()

  // Load piece from sessionStorage
  const { piece, error } = usePiece(params.id)

  // UI state
  const [midiBase64, setMidiBase64] = useState<string | null>(null)
  const [showResults, setShowResults] = useState(false)
  const [sheetMusicPage, setSheetMusicPage] = useState(1)
  const [pageInfo, setPageInfo] = useState<PageInfo | null>(null)

  // Session management
  const session = useSession()
  const sessionRef = useRef(session)
  sessionRef.current = session

  // Note coloring
  const noteColoring = useNoteColoring()
  const noteColoringRef = useRef(noteColoring)
  noteColoringRef.current = noteColoring

  // Re-apply note colors after each render (SVG gets replaced by React)
  // Also reapply when reviewing results (session ended but results exist)
  useLayoutEffect(() => {
    if (session.isActive || session.results) {
      noteColoringRef.current.reapplyColors()
    }
  })

  // Extra note indicators
  const extraNotes = useExtraNotes()
  const extraNotesRef = useRef(extraNotes)
  extraNotesRef.current = extraNotes

  // Playhead callbacks
  const handlePlayheadTimeUpdate = useCallback(
    (time: number) => noteColoringRef.current.markMissedNotes(time),
    []
  )
  const handlePlayheadEnd = useCallback(() => {
    if (sessionRef.current.isActive) {
      sessionRef.current.endSession()
    }
  }, [])
  const handlePlayheadPageChange = useCallback(
    (page: number) => setSheetMusicPage(page),
    []
  )

  // Playhead
  const playhead = usePlayhead(
    handlePlayheadTimeUpdate,
    handlePlayheadEnd,
    handlePlayheadPageChange
  )
  const playheadRef = useRef(playhead)
  playheadRef.current = playhead

  // Track playhead start
  const playheadStartedRef = useRef(false)

  // Initialize note map and playhead when sheet music loads
  const handleNoteElementsReady = useCallback((noteElements: NoteElementInfo[], svgElement: SVGElement | null) => {
    noteColoringRef.current.initializeNoteMap(noteElements)
    if (svgElement) {
      playheadRef.current.initialize(noteElements, svgElement)
      extraNotesRef.current.initializePitchMap(noteElements, svgElement)
    }
  }, [])

  // Process note results for coloring
  useEffect(() => {
    if (session.lastNoteResult) {
      noteColoringRef.current.processNoteResult(session.lastNoteResult)
    }
  }, [session.lastNoteResult])

  // Reset state when starting a new session
  useEffect(() => {
    if (session.isActive) {
      noteColoringRef.current.resetColors()
      playheadRef.current.reset()
      extraNotesRef.current.clear()
      setSheetMusicPage(1)
      setShowResults(false)
    } else {
      playheadRef.current.stop()
    }
  }, [session.isActive])

  // Show results modal when session ends
  useEffect(() => {
    if (session.results && !session.isActive) {
      setShowResults(true)
    }
  }, [session.results, session.isActive])

  // Start playhead on first correct note
  useEffect(() => {
    if (session.isActive && session.lastNoteResult && !playheadStartedRef.current) {
      if (session.lastNoteResult.result === "correct") {
        playheadStartedRef.current = true
        playheadRef.current.start(session.sessionState?.tempo ?? 100)
      }
    }
    if (!session.isActive) {
      playheadStartedRef.current = false
    }
  }, [session.isActive, session.lastNoteResult, session.sessionState?.tempo])

  // Submit MIDI notes to session
  useEffect(() => {
    if (!midi.lastNote || !midi.lastNote.on) return
    if (!sessionRef.current.isActive) return

    sessionRef.current.submitNote(
      midi.lastNote.pitch,
      midi.lastNote.velocity,
      midi.lastNote.on
    )
  }, [midi.lastNote])

  // Create extra note indicator when extra note result arrives
  useEffect(() => {
    if (!session.lastNoteResult || !session.isActive) return
    if (!playheadRef.current.position) return

    extraNotesRef.current.addExtraNote(
      session.lastNoteResult,
      playheadRef.current.position
    )
  }, [session.lastNoteResult, session.isActive])

  // Start practice session
  const handleStartPractice = useCallback(async () => {
    if (!piece?.xml) return

    // Import piece and start session
    const importResult = await sessionRef.current.importPiece({
      id: piece.id,
      xml: piece.xml,
      filePath: piece.path || piece.id,
    })

    if (!importResult) return

    await sessionRef.current.startSession({
      pieceId: importResult.id,
      measureStart: 1,
      measureEnd: piece.measures ?? 999,
      hand: "both",
      tempo: 100,
    })
  }, [piece])

  // End practice session
  const handleEndPractice = useCallback(async () => {
    await sessionRef.current.endSession()
  }, [])

  // Go back to library
  const handleBack = useCallback(() => {
    if (session.isActive) {
      session.endSession()
    }
    navigate("/")
  }, [navigate, session])

  // Dismiss results
  const handleDismissResults = useCallback(() => {
    setShowResults(false)
  }, [])

  // Retry with same settings
  const handleRetry = useCallback(() => {
    setShowResults(false)
    handleStartPractice()
  }, [handleStartPractice])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if typing in an input
      if (e.target instanceof HTMLInputElement) return

      switch (e.key) {
        case ' ': // Space: toggle start/stop practice
          e.preventDefault()
          if (session.isActive) {
            session.endSession()
          } else if (!session.isLoading && piece?.xml && midi.isConnected) {
            handleStartPractice()
          }
          break

        case 'Escape': // Escape: dismiss results or go back
          e.preventDefault()
          if (showResults) {
            setShowResults(false)
          } else if (session.isActive) {
            session.endSession()
          } else {
            navigate("/")
          }
          break

        case 'r':
        case 'R': // R: restart practice
          e.preventDefault()
          if (session.isActive) {
            session.endSession().then(() => handleStartPractice())
          } else {
            handleStartPractice()
          }
          break

        case 'ArrowLeft': // Left arrow: previous page (when not in session)
          if (!session.isActive && pageInfo && pageInfo.currentPage > 1) {
            e.preventDefault()
            pageInfo.setPage(pageInfo.currentPage - 1)
          }
          break

        case 'ArrowRight': // Right arrow: next page (when not in session)
          if (!session.isActive && pageInfo && pageInfo.currentPage < pageInfo.pageCount) {
            e.preventDefault()
            pageInfo.setPage(pageInfo.currentPage + 1)
          }
          break
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [session, handleStartPractice, showResults, navigate, piece?.xml, midi.isConnected, pageInfo])

  if (error) {
    return (
      <div className={styles.errorContainer}>
        <div className={styles.errorContent}>
          <h2>Unable to Load Piece</h2>
          <p>{error}</p>
          <button className={styles.backButton} onClick={() => navigate("/")}>
            Return to Library
          </button>
        </div>
      </div>
    )
  }

  if (!piece) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner} />
        <span>Loading...</span>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      {/* Header Bar */}
      <header className={styles.header}>
        <button className={styles.backButton} onClick={handleBack}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>Library</span>
        </button>

        <div className={styles.pieceInfo}>
          <h1 className={styles.pieceTitle}>{piece.title}</h1>
          <span className={styles.pieceComposer}>{piece.composer}</span>
        </div>

        <div className={styles.headerRight}>
          <div className={`${styles.midiStatus} ${midi.isConnected ? styles.connected : ""}`}>
            <span className={styles.midiDot} />
            <span>{midi.isConnected ? "MIDI Ready" : "No MIDI"}</span>
          </div>
        </div>
      </header>

      {/* Sheet Music Display */}
      <main className={styles.main}>
        <SheetMusicView
          musicXml={piece.xml}
          onMidiReady={setMidiBase64}
          onNoteElementsReady={handleNoteElementsReady}
          onPageInfoReady={setPageInfo}
          playheadPosition={playhead.position}
          showPlayhead={session.isActive && playhead.isRunning}
          page={session.isActive ? sheetMusicPage : undefined}
          extraNotes={extraNotes.extraNotes}
          noteSize={extraNotes.staffBounds ? {
            width: extraNotes.staffBounds.noteWidth,
            height: extraNotes.staffBounds.noteHeight,
          } : undefined}
        />
      </main>

      {/* Practice Controls */}
      <PracticeControls
        isActive={session.isActive}
        isLoading={session.isLoading}
        isMidiConnected={midi.isConnected}
        onStart={handleStartPractice}
        onStop={handleEndPractice}
        midiBase64={midiBase64}
        sessionStats={session.sessionState ? {
          playedNotes: session.sessionState.playedNoteCount ?? 0,
          expectedNotes: session.sessionState.expectedNoteCount ?? 0,
          matchedNotes: session.sessionState.matchedCount ?? 0,
        } : undefined}
      />


      {/* Results Overlay */}
      {showResults && session.results && (
        <ResultsOverlay
          results={session.results}
          onDismiss={handleDismissResults}
          onRetry={handleRetry}
        />
      )}

      {/* Dev: MIDI Simulator */}
      {import.meta.env.DEV && (
        <MidiSimulator onNote={midi.simulateNote} onEnable={midi.enableSimulation} />
      )}
    </div>
  )
}
