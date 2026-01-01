import { useCallback, useState, useRef, useEffect } from "react"
import { useLocation, useParams } from "wouter"
import { SheetMusicView } from "../components/SheetMusicView.js"
import { PracticeControls } from "../components/PracticeControls.js"
import { ResultsOverlay } from "../components/ResultsOverlay.js"
import { CountdownOverlay } from "../components/CountdownOverlay.js"
import type { PlayedNoteIndicator } from "../components/PlayedNoteIndicators.js"
import {
  type NoteElementInfo,
  useSession,
  useNoteColoring,
  usePlayhead,
  type UseMidiResult,
  type Hand,
} from "../hooks/index.js"
import styles from "./Practice.module.css"

interface StoredPiece {
  id: string
  title: string
  composer: string
  path: string
  xml: string
  measures?: number
}

interface PracticeProps {
  midi: UseMidiResult
}

export function Practice({ midi }: PracticeProps) {
  const [, navigate] = useLocation()
  const params = useParams<{ id: string }>()
  const [piece, setPiece] = useState<StoredPiece | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [midiBase64, setMidiBase64] = useState<string | null>(null)
  const [showCountdown, setShowCountdown] = useState(false)
  const [countdownValue, setCountdownValue] = useState(3)
  const [showResults, setShowResults] = useState(false)

  // Practice settings
  const [tempo, setTempo] = useState(100)
  const [selectedHand, setSelectedHand] = useState<Hand>("both")
  const [measureStart, setMeasureStart] = useState(1)
  const [measureEnd, setMeasureEnd] = useState(1)

  // Session
  const session = useSession()
  const sessionRef = useRef(session)
  sessionRef.current = session

  // Note coloring
  const noteColoring = useNoteColoring()
  const noteColoringRef = useRef(noteColoring)
  noteColoringRef.current = noteColoring

  // Sheet music page state
  const [sheetMusicPage, setSheetMusicPage] = useState(1)

  // Played note indicators for visual feedback
  const [playedNotes, setPlayedNotes] = useState<PlayedNoteIndicator[]>([])
  const [staffBounds, setStaffBounds] = useState<{ minY: number; maxY: number; minPitch: number; maxPitch: number } | undefined>()
  const noteIdCounter = useRef(0)
  // Map pitch to Y coordinate (built from actual note elements)
  const pitchToYMapRef = useRef<Map<number, number>>(new Map())

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
  const svgElementRef = useRef<SVGElement | null>(null)
  const playhead = usePlayhead(
    handlePlayheadTimeUpdate,
    handlePlayheadEnd,
    handlePlayheadPageChange
  )
  const playheadRef = useRef(playhead)
  playheadRef.current = playhead

  // Track playhead start
  const playheadStartedRef = useRef(false)

  // Load piece from sessionStorage
  useEffect(() => {
    const stored = sessionStorage.getItem("etude:currentPiece")
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as StoredPiece
        if (parsed.id === params.id || params.id?.startsWith("custom-")) {
          setPiece(parsed)
          if (parsed.measures) {
            setMeasureEnd(parsed.measures)
          }
        } else {
          setError("Piece not found")
        }
      } catch {
        setError("Failed to load piece data")
      }
    } else {
      setError("No piece selected")
    }
  }, [params.id])

  // Initialize note map and playhead when sheet music loads
  const handleNoteElementsReady = useCallback((noteElements: NoteElementInfo[], svgElement: SVGElement | null) => {
    noteColoringRef.current.initializeNoteMap(noteElements)
    svgElementRef.current = svgElement
    if (svgElement) {
      playheadRef.current.initialize(noteElements, svgElement)

      // Build pitch->Y map from actual note elements for indicator positioning
      const svgBounds = svgElement.getBoundingClientRect()
      const pitchYMap = new Map<number, number[]>()
      let minY = Infinity
      let maxY = 0
      let minPitch = Infinity
      let maxPitch = 0

      for (const note of noteElements) {
        const el = document.getElementById(note.elementId)
        if (!el) continue

        const bounds = el.getBoundingClientRect()
        const y = bounds.top - svgBounds.top + bounds.height / 2 // Center of note

        minY = Math.min(minY, y)
        maxY = Math.max(maxY, y)
        minPitch = Math.min(minPitch, note.pitch)
        maxPitch = Math.max(maxPitch, note.pitch)

        // Collect all Y values for each pitch
        if (!pitchYMap.has(note.pitch)) {
          pitchYMap.set(note.pitch, [])
        }
        pitchYMap.get(note.pitch)!.push(y)
      }

      // Average Y values for each pitch
      const finalPitchMap = new Map<number, number>()
      for (const [pitch, yValues] of pitchYMap) {
        const avgY = yValues.reduce((a, b) => a + b, 0) / yValues.length
        finalPitchMap.set(pitch, avgY)
      }
      pitchToYMapRef.current = finalPitchMap

      if (minY !== Infinity) {
        setStaffBounds({ minY, maxY, minPitch, maxPitch })
      }
    }

    // Update page count from actual notes (use page as proxy for measures)
    if (noteElements.length > 0) {
      const maxPage = Math.max(...noteElements.map(n => n.page ?? 1))
      // Estimate ~4 measures per page
      setMeasureEnd(maxPage * 4)
    }
  }, [])

  // Process note results for coloring
  useEffect(() => {
    if (session.lastNoteResult) {
      noteColoringRef.current.processNoteResult(session.lastNoteResult)
    }
  }, [session.lastNoteResult])

  // Reset colors and playhead when starting a new session
  useEffect(() => {
    if (session.isActive) {
      noteColoringRef.current.resetColors()
      playheadRef.current.reset()
      setSheetMusicPage(1)
      setShowResults(false) // Hide any previous results
      setPlayedNotes([]) // Clear played note indicators
      noteIdCounter.current = 0
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

  // Submit MIDI notes to session when they arrive
  useEffect(() => {
    if (!midi.lastNote || !midi.lastNote.on) return
    if (!sessionRef.current.isActive) return

    // Submit note to session
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
    if (!staffBounds) return

    const result = session.lastNoteResult
    const noteResult: "correct" | "wrong" | "extra" =
      result.result === "correct" ? "correct" :
      result.result === "wrong" ? "wrong" : "extra"

    // Use playhead position for X coordinate
    const x = playheadRef.current.position.x

    // Get Y position from pitch map, or interpolate if not found
    let y: number
    const pitchMap = pitchToYMapRef.current
    if (pitchMap.has(result.pitch)) {
      y = pitchMap.get(result.pitch)!
    } else {
      // Interpolate Y based on pitch range
      // Higher pitch = lower Y (staff goes up visually)
      const pitchRange = staffBounds.maxPitch - staffBounds.minPitch || 1
      const yRange = staffBounds.maxY - staffBounds.minY
      const pitchRatio = (result.pitch - staffBounds.minPitch) / pitchRange
      // Invert because higher pitch = lower Y
      y = staffBounds.maxY - pitchRatio * yRange
    }

    const indicator: PlayedNoteIndicator = {
      id: `note-${noteIdCounter.current++}`,
      pitch: result.pitch,
      x,
      y,
      result: noteResult,
      timestamp: Date.now(),
    }

    setPlayedNotes(prev => [...prev, indicator])

    // Remove this indicator after 3 seconds
    setTimeout(() => {
      setPlayedNotes(prev => prev.filter(n => n.id !== indicator.id))
    }, 3000)
  }, [session.lastNoteResult, session.isActive, staffBounds])

  // Start practice session
  const handleStartPractice = useCallback(async () => {
    if (!piece?.xml) return

    // Show countdown
    setShowCountdown(true)
    setCountdownValue(3)

    // Countdown animation
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
          playedNotes={playedNotes}
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

// Dev-only MIDI simulator component
function MidiSimulator({ onNote }: { onNote: (pitch: number) => void }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const notes = [60, 62, 64, 65, 67, 69, 71, 72]
  const noteNames = ["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5"]

  return (
    <div
      style={{
        position: "fixed",
        bottom: "100px",
        right: "16px",
        zIndex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: "8px",
      }}
    >
      {isExpanded && (
        <div
          style={{
            display: "flex",
            gap: "2px",
            padding: "8px",
            background: "#fef3c7",
            borderRadius: "8px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          }}
        >
          {notes.map((pitch, i) => (
            <button
              key={pitch}
              onClick={() => onNote(pitch)}
              style={{
                width: "36px",
                height: "80px",
                background: "#fff",
                border: "1px solid #ddd",
                borderRadius: "0 0 4px 4px",
                cursor: "pointer",
                fontSize: "10px",
                fontWeight: "500",
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "center",
                paddingBottom: "4px",
              }}
            >
              {noteNames[i]}
            </button>
          ))}
        </div>
      )}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        style={{
          padding: "8px 12px",
          background: "#fef3c7",
          border: "none",
          borderRadius: "9999px",
          fontSize: "12px",
          fontWeight: "500",
          cursor: "pointer",
          boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
        }}
      >
        {isExpanded ? "Hide" : "MIDI Sim"}
      </button>
    </div>
  )
}
