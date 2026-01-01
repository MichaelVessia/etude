import { useMidi, type MidiNoteEvent, useAudio, useSession, useNoteColoring, usePlayhead, type NoteElementInfo } from "./hooks/index.js"
import { SheetMusic, AudioPlayer, PieceLibrary } from "./components/index.js"
import { useCallback, useState, useRef, useEffect } from "react"

// Convert MIDI pitch to note name
function pitchToNote(pitch: number): string {
  const notes = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
  const octave = Math.floor(pitch / 12) - 1
  const note = notes[pitch % 12]
  return `${note}${octave}`
}

// Clean up MIDI device name for display
function formatDeviceName(name: string, manufacturer: string): string {
  // Remove common USB/MIDI prefixes
  let cleanName = name
    .replace(/^USB func for MIDI\s*/i, "")
    .replace(/^MIDI\s*/i, "")
    .replace(/\s*MIDI\s*(IN|OUT)\s*\d*/gi, "")
    .trim()

  // Clean up manufacturer
  const cleanMfg = manufacturer
    .replace(/\s*(MI\.|Mfg\.|Co\.|Ltd\.|Inc\.|Corp\.)+/gi, "")
    .trim()

  // If name is empty after cleaning, use manufacturer
  if (!cleanName || cleanName === "Unknown") {
    return cleanMfg || manufacturer || name
  }

  // If manufacturer adds value, append it
  if (cleanMfg && !cleanName.toLowerCase().includes(cleanMfg.toLowerCase())) {
    return `${cleanName} (${cleanMfg})`
  }

  return cleanName
}

export function App() {
  const [noteHistory, setNoteHistory] = useState<MidiNoteEvent[]>([])
  const [musicXml, setMusicXml] = useState<string | null>(null)
  const [midiBase64, setMidiBase64] = useState<string | null>(null)
  const [selectedPieceId, setSelectedPieceId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { isReady: audioReady, playNote } = useAudio()

  // Session management
  const session = useSession()

  // Note coloring for visual feedback
  const noteColoring = useNoteColoring()

  // Playhead for timing reference
  const svgElementRef = useRef<SVGElement | null>(null)
  const playhead = usePlayhead(
    // On time update: mark missed notes
    (time) => noteColoring.markMissedNotes(time),
    // On end: auto-end session
    () => {
      if (session.isActive) {
        session.endSession()
      }
    }
  )

  // Initialize note map and playhead when sheet music loads
  const handleNoteElementsReady = useCallback((noteElements: NoteElementInfo[], svgElement: SVGElement | null) => {
    noteColoring.initializeNoteMap(noteElements)
    svgElementRef.current = svgElement
    if (svgElement) {
      playhead.initialize(noteElements, svgElement)
    }
  }, [noteColoring, playhead])

  // Process note results for coloring
  useEffect(() => {
    if (session.lastNoteResult) {
      noteColoring.processNoteResult(session.lastNoteResult)
    }
  }, [session.lastNoteResult, noteColoring])

  // Reset colors and playhead when starting a new session
  useEffect(() => {
    if (session.isActive) {
      noteColoring.resetColors()
      playhead.reset()
    } else {
      playhead.stop()
    }
  }, [session.isActive, noteColoring, playhead])

  // Track whether we've started the playhead for this session
  const playheadStartedRef = useRef(false)

  // Start playhead on first note
  useEffect(() => {
    if (session.isActive && session.lastNoteResult && !playheadStartedRef.current) {
      if (session.lastNoteResult.result === "correct") {
        playheadStartedRef.current = true
        playhead.start(session.sessionState?.tempo ?? 100)
      }
    }
    if (!session.isActive) {
      playheadStartedRef.current = false
    }
  }, [session.isActive, session.lastNoteResult, session.sessionState?.tempo, playhead])

  const handleNote = useCallback(
    (event: MidiNoteEvent) => {
      // Only show note-on events in history
      if (event.on) {
        setNoteHistory((prev) => [...prev.slice(-19), event])
      }

      // Play the note through the audio engine
      if (event.on && audioReady) {
        playNote(event.pitch, 0.3)
      }

      // Submit note-on events to session if active
      if (session.isActive && event.on) {
        session.submitNote(event.pitch, event.velocity, event.on)
      }
    },
    [audioReady, playNote, session]
  )

  const midi = useMidi(handleNote)

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (ev) => {
      const content = ev.target?.result
      if (typeof content === "string") {
        setMusicXml(content)
        setSelectedPieceId(null) // Custom file, no piece ID
      }
    }
    reader.readAsText(file)
  }, [])

  const handlePieceSelect = useCallback((xml: string, filePath: string) => {
    setMusicXml(xml)
    setSelectedPieceId(filePath)
  }, [])

  const handleStartSession = useCallback(async () => {
    if (!selectedPieceId || !musicXml) {
      alert("Please select a piece first")
      return
    }

    // Import the piece first (will return existing if already imported)
    const importResult = await session.importPiece({
      id: selectedPieceId,
      xml: musicXml,
      filePath: selectedPieceId,
    })

    if (!importResult) {
      return // Error already set by importPiece
    }

    await session.startSession({
      pieceId: importResult.id,
      measureStart: 1,
      measureEnd: importResult.totalMeasures,
      hand: "both",
      tempo: 100,
    })
  }, [selectedPieceId, musicXml, session])

  const handleEndSession = useCallback(async () => {
    await session.endSession()
  }, [session])

  // Get result color based on note result
  const getResultColor = (result: "correct" | "wrong" | "extra") => {
    switch (result) {
      case "correct":
        return "#16a34a" // green
      case "wrong":
        return "#dc2626" // red
      case "extra":
        return "#ca8a04" // yellow
    }
  }

  return (
    <div style={{ fontFamily: "system-ui", padding: "2rem", maxWidth: "1000px", margin: "0 auto" }}>
      <h1>Etude - Piano Practice</h1>

      {!midi.isSupported && (
        <div style={{ color: "red", padding: "1rem", background: "#fee", borderRadius: "4px", marginBottom: "1rem" }}>
          Web MIDI is not supported in this browser. Please use Chrome or Edge.
        </div>
      )}

      {midi.error && (
        <div style={{ color: "red", padding: "1rem", background: "#fee", borderRadius: "4px", marginBottom: "1rem" }}>
          MIDI Error: {midi.error}
        </div>
      )}

      {session.error && (
        <div style={{ color: "red", padding: "1rem", background: "#fee", borderRadius: "4px", marginBottom: "1rem" }}>
          Session Error: {session.error}
        </div>
      )}

      {/* MIDI Device Selection */}
      <section style={{ marginTop: "1rem", padding: "1rem", background: "#f9fafb", borderRadius: "8px" }}>
        <h2 style={{ margin: "0 0 1rem 0" }}>MIDI Device</h2>
        {midi.devices.length === 0 ? (
          <p style={{ color: "#666" }}>No MIDI devices found. Connect a MIDI keyboard and refresh.</p>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <select
              value={midi.selectedDevice?.id ?? ""}
              onChange={(e) => midi.selectDevice(e.target.value || null)}
              style={{ padding: "0.5rem", fontSize: "1rem", flex: 1 }}
            >
              <option value="">Select a device...</option>
              {midi.devices.map((device) => (
                <option key={device.id} value={device.id}>
                  {formatDeviceName(device.name, device.manufacturer)}
                </option>
              ))}
            </select>
            {midi.isConnected && (
              <span style={{ color: "green", fontWeight: "bold" }}>Connected</span>
            )}
          </div>
        )}
      </section>

      {/* Practice Session Controls */}
      <section style={{ marginTop: "1rem", padding: "1rem", background: "#f0fdf4", borderRadius: "8px" }}>
        <h2 style={{ margin: "0 0 1rem 0" }}>Practice Session</h2>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          {!session.isActive ? (
            <button
              onClick={handleStartSession}
              disabled={!midi.isConnected || !musicXml || session.isLoading}
              style={{
                padding: "0.75rem 1.5rem",
                fontSize: "1rem",
                background: midi.isConnected && musicXml ? "#16a34a" : "#ccc",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: midi.isConnected && musicXml ? "pointer" : "not-allowed",
              }}
            >
              {session.isLoading ? "Starting..." : "Start Practice"}
            </button>
          ) : (
            <button
              onClick={handleEndSession}
              disabled={session.isLoading}
              style={{
                padding: "0.75rem 1.5rem",
                fontSize: "1rem",
                background: "#dc2626",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
              }}
            >
              {session.isLoading ? "Ending..." : "End Practice"}
            </button>
          )}

          {session.isActive && session.sessionState && (
            <div style={{ display: "flex", gap: "2rem", fontSize: "0.875rem" }}>
              <span>
                <strong>Notes:</strong> {session.sessionState.playedNoteCount ?? 0} / {session.sessionState.expectedNoteCount ?? 0}
              </span>
              <span>
                <strong>Matched:</strong> {session.sessionState.matchedCount ?? 0}
              </span>
            </div>
          )}
        </div>

        {/* Last note feedback */}
        {session.isActive && session.lastNoteResult && (
          <div
            style={{
              marginTop: "1rem",
              padding: "1rem",
              background: "white",
              borderRadius: "4px",
              borderLeft: `4px solid ${getResultColor(session.lastNoteResult.result)}`,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
              <span style={{ fontSize: "2rem", fontWeight: "bold" }}>
                {pitchToNote(session.lastNoteResult.pitch)}
              </span>
              <span
                style={{
                  padding: "0.25rem 0.5rem",
                  background: getResultColor(session.lastNoteResult.result),
                  color: "white",
                  borderRadius: "4px",
                  fontWeight: "bold",
                  textTransform: "uppercase",
                }}
              >
                {session.lastNoteResult.result}
              </span>
              <span style={{ color: "#666" }}>
                Timing: {session.lastNoteResult.timingOffset > 0 ? "+" : ""}{session.lastNoteResult.timingOffset}ms
              </span>
            </div>
          </div>
        )}

        {/* Session Results */}
        {session.results && (
          <div
            style={{
              marginTop: "1rem",
              padding: "1.5rem",
              background: "white",
              borderRadius: "8px",
              border: "2px solid #16a34a",
            }}
          >
            <h3 style={{ margin: "0 0 1rem 0" }}>Session Complete!</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem" }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "2rem", fontWeight: "bold", color: "#16a34a" }}>
                  {Math.round(session.results.noteAccuracy * 100)}%
                </div>
                <div style={{ color: "#666" }}>Note Accuracy</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "2rem", fontWeight: "bold", color: "#2563eb" }}>
                  {Math.round(session.results.timingAccuracy * 100)}%
                </div>
                <div style={{ color: "#666" }}>Timing</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "2rem", fontWeight: "bold", color: "#7c3aed" }}>
                  {Math.round(session.results.combinedScore)}%
                </div>
                <div style={{ color: "#666" }}>Overall</div>
              </div>
            </div>
            {session.results.extraNotes > 0 && (
              <div style={{ marginTop: "1rem", color: "#ca8a04" }}>
                Extra notes played: {session.results.extraNotes}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Note Display */}
      <section style={{ marginTop: "1rem", display: "flex", gap: "1rem" }}>
        <div style={{ flex: 1, padding: "1rem", background: "#f9fafb", borderRadius: "8px" }}>
          <h2 style={{ margin: "0 0 0.5rem 0" }}>Last Note</h2>
          {midi.lastNote ? (
            <div
              style={{
                fontSize: "3rem",
                fontWeight: "bold",
                color: midi.lastNote.on ? "#2563eb" : "#666",
              }}
            >
              {pitchToNote(midi.lastNote.pitch)}
            </div>
          ) : (
            <p style={{ color: "#666" }}>Play a note...</p>
          )}
        </div>

        <div style={{ flex: 2, padding: "1rem", background: "#f9fafb", borderRadius: "8px" }}>
          <h2 style={{ margin: "0 0 0.5rem 0" }}>Note History</h2>
          <div
            style={{
              fontFamily: "monospace",
              fontSize: "0.75rem",
              maxHeight: "100px",
              overflow: "auto",
            }}
          >
            {noteHistory.length === 0 ? (
              <span style={{ color: "#666" }}>No notes yet...</span>
            ) : (
              noteHistory.map((note, i) => (
                <span key={i} style={{ color: note.on ? "#16a34a" : "#999", marginRight: "0.5rem" }}>
                  {pitchToNote(note.pitch)}
                </span>
              ))
            )}
          </div>
        </div>
      </section>

      {/* Sheet Music */}
      <section style={{ marginTop: "1.5rem" }}>
        <h2>Sheet Music</h2>
        <div style={{ display: "flex", gap: "1.5rem", alignItems: "flex-start" }}>
          <div style={{ minWidth: "220px" }}>
            <PieceLibrary onSelect={handlePieceSelect} />
            <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid #ddd" }}>
              <h3 style={{ margin: "0 0 0.5rem 0", fontSize: "0.875rem" }}>Or load your own</h3>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xml,.musicxml"
                onChange={handleFileSelect}
                style={{ display: "none" }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                style={{ padding: "0.5rem 1rem", fontSize: "0.875rem" }}
              >
                Load MusicXML
              </button>
            </div>
            {musicXml && (
              <button
                onClick={() => {
                  setMusicXml(null)
                  setMidiBase64(null)
                  setSelectedPieceId(null)
                }}
                style={{ padding: "0.5rem 1rem", fontSize: "0.875rem", marginTop: "0.5rem" }}
              >
                Clear
              </button>
            )}
          </div>
          <div style={{ flex: 1 }}>
            <SheetMusic
              musicXml={musicXml}
              scale={35}
              onMidiReady={setMidiBase64}
              onNoteElementsReady={handleNoteElementsReady}
              playheadPosition={playhead.position}
              showPlayhead={session.isActive && playhead.isRunning}
            />
          </div>
        </div>
      </section>

      {/* Playback */}
      <section style={{ marginTop: "1.5rem" }}>
        <h2>Playback</h2>
        <AudioPlayer midiBase64={midiBase64} />
      </section>
    </div>
  )
}
