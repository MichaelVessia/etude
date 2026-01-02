import { useCallback, useState, useRef, useEffect } from "react"
import { useLocation, useParams } from "wouter"
import { SheetMusicView } from "../components/SheetMusicView.js"
import { PracticeControls } from "../components/PracticeControls.js"
import { ResultsOverlay } from "../components/ResultsOverlay.js"
import { CountdownOverlay } from "../components/CountdownOverlay.js"
import { MidiSimulator } from "../components/dev/MidiSimulator.js"
import {
  type NoteElementInfo,
  useSession,
  useNoteColoring,
  usePlayhead,
  usePiece,
  usePlayedNotes,
  type UseMidiResult,
  type Hand,
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
  const [showCountdown, setShowCountdown] = useState(false)
  const [countdownValue, setCountdownValue] = useState(3)
  const [showResults, setShowResults] = useState(false)
  const [sheetMusicPage, setSheetMusicPage] = useState(1)

  // Practice settings
  const [tempo, setTempo] = useState(100)
  const [selectedHand, setSelectedHand] = useState<Hand>("both")
  const [measureStart, setMeasureStart] = useState(1)
  const [measureEnd, setMeasureEnd] = useState(piece?.measures ?? 1)

  // Update measureEnd when piece loads
  useEffect(() => {
    if (piece?.measures) {
      setMeasureEnd(piece.measures)
    }
  }, [piece?.measures])

  // Session management
  const session = useSession()
  const sessionRef = useRef(session)
  sessionRef.current = session

  // Note coloring
  const noteColoring = useNoteColoring()
  const noteColoringRef = useRef(noteColoring)
  noteColoringRef.current = noteColoring

  // Played note indicators
  const playedNotes = usePlayedNotes()
  const playedNotesRef = useRef(playedNotes)
  playedNotesRef.current = playedNotes

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
      playedNotesRef.current.initializePitchMap(noteElements, svgElement)
    }

    // Update measure count from actual notes
    if (noteElements.length > 0) {
      const maxPage = Math.max(...noteElements.map(n => n.page ?? 1))
      setMeasureEnd(maxPage * 4)
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
      playedNotesRef.current.clear()
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

  // Create played note indicator when note result arrives
  useEffect(() => {
    if (!session.lastNoteResult || !session.isActive) return
    if (!playheadRef.current.position) return

    playedNotesRef.current.addNoteIndicator(
      session.lastNoteResult,
      playheadRef.current.position
    )
  }, [session.lastNoteResult, session.isActive])

  // Start practice session
  const handleStartPractice = useCallback(async () => {
    if (!piece?.xml) return

    // Show countdown
    setShowCountdown(true)
    setCountdownValue(3)

    for (let i = 3; i >= 1; i--) {
      setCountdownValue(i)
      await new Promise(resolve => setTimeout(resolve, 1000))
    }

    setShowCountdown(false)

    // Import piece and start session
    const importResult = await sessionRef.current.importPiece({
      id: piece.id,
      xml: piece.xml,
      filePath: piece.path || piece.id,
    })

    if (!importResult) return

    await sessionRef.current.startSession({
      pieceId: importResult.id,
      measureStart,
      measureEnd,
      hand: selectedHand,
      tempo,
    })
  }, [piece, measureStart, measureEnd, selectedHand, tempo])

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
          playheadPosition={playhead.position}
          showPlayhead={session.isActive && playhead.isRunning}
          page={session.isActive ? sheetMusicPage : undefined}
        />
      </main>

      {/* Practice Controls */}
      <PracticeControls
        isActive={session.isActive}
        isLoading={session.isLoading}
        isMidiConnected={midi.isConnected}
        tempo={tempo}
        onTempoChange={setTempo}
        selectedHand={selectedHand}
        onHandChange={setSelectedHand}
        measureStart={measureStart}
        measureEnd={measureEnd}
        maxMeasure={measureEnd}
        onMeasureStartChange={setMeasureStart}
        onMeasureEndChange={setMeasureEnd}
        onStart={handleStartPractice}
        onStop={handleEndPractice}
        midiBase64={midiBase64}
        sessionStats={session.sessionState ? {
          playedNotes: session.sessionState.playedNoteCount ?? 0,
          expectedNotes: session.sessionState.expectedNoteCount ?? 0,
          matchedNotes: session.sessionState.matchedCount ?? 0,
        } : undefined}
      />

      {/* Countdown Overlay */}
      {showCountdown && (
        <CountdownOverlay value={countdownValue} />
      )}

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
        <MidiSimulator onNote={midi.simulateNote} />
      )}
    </div>
  )
}
