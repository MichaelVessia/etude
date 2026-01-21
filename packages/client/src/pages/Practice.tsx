import { useCallback, useState, useRef, useEffect, useLayoutEffect } from "react"
import { useLocation, useParams } from "wouter"
import { SheetMusicView, type PageInfo } from "../components/SheetMusicView.js"
import { PracticeControls } from "../components/PracticeControls.js"
import { ResultsOverlay } from "../components/ResultsOverlay.js"
import { MidiSimulator } from "../components/dev/MidiSimulator.js"
import { MidiDeviceSelector } from "../components/MidiDeviceSelector.js"
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
  onSelectDevice: (id: string | null) => void
}

export function Practice({ midi, onSelectDevice }: PracticeProps) {
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
  // Intentionally no deps: must run after every render to reapply colors to fresh DOM
  useLayoutEffect(() => {
    if (session.isActive || session.results) {
      noteColoringRef.current.reapplyColors()
    }
  })

  // Extra note indicators
  const extraNotes = useExtraNotes()
  const extraNotesRef = useRef(extraNotes)
  extraNotesRef.current = extraNotes

  // Playhead callbacks (stable refs to avoid recreation)
  const handlePlayheadTimeUpdate = useCallback(
    (time: number) => {
      const tempo = sessionRef.current.sessionState?.tempo ?? 100
      noteColoringRef.current.markMissedNotes(time, tempo)
    },
    []
  )
  const handlePlayheadEnd = useCallback(() => {
    if (sessionRef.current.isActive) {
      sessionRef.current.endSession()
    }
  }, [])

  // Playhead
  const playhead = usePlayhead(
    handlePlayheadTimeUpdate,
    handlePlayheadEnd,
    setSheetMusicPage
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

  // Handle session state changes: reset on start, stop playhead on end
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

  // Show results modal when session ends with results
  useEffect(() => {
    if (session.results && !session.isActive) {
      setShowResults(true)
    }
  }, [session.results, session.isActive])

  // Start playhead on first correct note; reset flag when session ends
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

  // Submit MIDI notes to session (uses ref to avoid session object in deps)
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
    if (sessionRef.current.isActive) {
      sessionRef.current.endSession()
    }
    navigate("/")
  }, [navigate])

  // Refs for keyboard handler to avoid effect rerunning on every state change
  const showResultsRef = useRef(showResults)
  showResultsRef.current = showResults
  const pageInfoRef = useRef(pageInfo)
  pageInfoRef.current = pageInfo
  const pieceRef = useRef(piece)
  pieceRef.current = piece
  const midiRef = useRef(midi)
  midiRef.current = midi
  const handleStartPracticeRef = useRef(handleStartPractice)
  handleStartPracticeRef.current = handleStartPractice

  // Keyboard shortcuts (minimal deps using refs)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.target instanceof HTMLInputElement) return

      const currentSession = sessionRef.current
      const currentPageInfo = pageInfoRef.current
      const currentPiece = pieceRef.current
      const currentMidi = midiRef.current

      switch (e.key) {
        case ' ':
          e.preventDefault()
          if (currentSession.isActive) {
            currentSession.endSession()
          } else if (!currentSession.isLoading && currentPiece?.xml && currentMidi.isConnected) {
            handleStartPracticeRef.current()
          }
          break

        case 'Escape':
          e.preventDefault()
          if (showResultsRef.current) {
            setShowResults(false)
          } else if (currentSession.isActive) {
            currentSession.endSession()
          } else {
            navigate("/")
          }
          break

        case 'r':
        case 'R':
          e.preventDefault()
          if (currentSession.isActive) {
            currentSession.endSession().then(() => handleStartPracticeRef.current())
          } else {
            handleStartPracticeRef.current()
          }
          break

        case 'ArrowLeft':
          if (!currentSession.isActive && currentPageInfo && currentPageInfo.currentPage > 1) {
            e.preventDefault()
            currentPageInfo.setPage(currentPageInfo.currentPage - 1)
          }
          break

        case 'ArrowRight':
          if (!currentSession.isActive && currentPageInfo && currentPageInfo.currentPage < currentPageInfo.pageCount) {
            e.preventDefault()
            currentPageInfo.setPage(currentPageInfo.currentPage + 1)
          }
          break
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [navigate])

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
          <MidiDeviceSelector midi={midi} onSelectDevice={onSelectDevice} />
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
          onDismiss={() => setShowResults(false)}
          onRetry={() => {
            setShowResults(false)
            handleStartPractice()
          }}
        />
      )}

      {/* Dev: MIDI Simulator */}
      {import.meta.env.DEV && (
        <MidiSimulator onNote={midi.simulateNote} onEnable={midi.enableSimulation} />
      )}
    </div>
  )
}
