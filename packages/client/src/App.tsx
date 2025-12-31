import { useMidi, type MidiNoteEvent } from "./hooks/index.js"
import { SheetMusic } from "./components/index.js"
import { useCallback, useState, useRef } from "react"

// Convert MIDI pitch to note name
function pitchToNote(pitch: number): string {
  const notes = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
  const octave = Math.floor(pitch / 12) - 1
  const note = notes[pitch % 12]
  return `${note}${octave}`
}

export function App() {
  const [noteHistory, setNoteHistory] = useState<MidiNoteEvent[]>([])
  const [musicXml, setMusicXml] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleNote = useCallback((event: MidiNoteEvent) => {
    setNoteHistory((prev) => [...prev.slice(-19), event])
    console.log(
      `${event.on ? "Note On" : "Note Off"}: ${pitchToNote(event.pitch)} (${event.pitch}) vel=${event.velocity}`
    )
  }, [])

  const midi = useMidi(handleNote)

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (ev) => {
      const content = ev.target?.result
      if (typeof content === "string") {
        setMusicXml(content)
      }
    }
    reader.readAsText(file)
  }, [])

  return (
    <div style={{ fontFamily: "system-ui", padding: "2rem", maxWidth: "800px", margin: "0 auto" }}>
      <h1>Etude - MIDI Test</h1>

      {!midi.isSupported && (
        <div style={{ color: "red", padding: "1rem", background: "#fee" }}>
          Web MIDI is not supported in this browser. Please use Chrome or Edge.
        </div>
      )}

      {midi.error && (
        <div style={{ color: "red", padding: "1rem", background: "#fee" }}>Error: {midi.error}</div>
      )}

      <section style={{ marginTop: "1rem" }}>
        <h2>MIDI Devices</h2>
        {midi.devices.length === 0 ? (
          <p style={{ color: "#666" }}>No MIDI devices found. Connect a MIDI keyboard and refresh.</p>
        ) : (
          <select
            value={midi.selectedDevice?.id ?? ""}
            onChange={(e) => midi.selectDevice(e.target.value || null)}
            style={{ padding: "0.5rem", fontSize: "1rem" }}
          >
            <option value="">Select a device...</option>
            {midi.devices.map((device) => (
              <option key={device.id} value={device.id}>
                {device.name} ({device.manufacturer})
              </option>
            ))}
          </select>
        )}
        {midi.isConnected && (
          <span style={{ marginLeft: "1rem", color: "green" }}>Connected</span>
        )}
      </section>

      <section style={{ marginTop: "2rem" }}>
        <h2>Last Note</h2>
        {midi.lastNote ? (
          <div
            style={{
              fontSize: "3rem",
              fontWeight: "bold",
              color: midi.lastNote.on ? "#2563eb" : "#666",
            }}
          >
            {pitchToNote(midi.lastNote.pitch)}
            <span style={{ fontSize: "1rem", marginLeft: "1rem" }}>
              ({midi.lastNote.pitch}) vel={midi.lastNote.velocity}
            </span>
          </div>
        ) : (
          <p style={{ color: "#666" }}>Play a note on your MIDI device...</p>
        )}
      </section>

      <section style={{ marginTop: "2rem" }}>
        <h2>Note History</h2>
        <div
          style={{
            fontFamily: "monospace",
            fontSize: "0.875rem",
            background: "#f5f5f5",
            padding: "1rem",
            borderRadius: "4px",
            maxHeight: "300px",
            overflow: "auto",
          }}
        >
          {noteHistory.length === 0 ? (
            <span style={{ color: "#666" }}>No notes played yet...</span>
          ) : (
            noteHistory.map((note, i) => (
              <div key={i} style={{ color: note.on ? "#16a34a" : "#666" }}>
                {note.on ? "ON " : "OFF"} {pitchToNote(note.pitch).padEnd(4)} vel={String(note.velocity).padStart(3)}
              </div>
            ))
          )}
        </div>
      </section>

      <section style={{ marginTop: "2rem" }}>
        <h2>Sheet Music</h2>
        <div style={{ marginBottom: "1rem" }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xml,.musicxml"
            onChange={handleFileSelect}
            style={{ display: "none" }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{ padding: "0.5rem 1rem", fontSize: "1rem" }}
          >
            Load MusicXML File
          </button>
          {musicXml && (
            <button
              onClick={() => setMusicXml(null)}
              style={{ padding: "0.5rem 1rem", fontSize: "1rem", marginLeft: "0.5rem" }}
            >
              Clear
            </button>
          )}
        </div>
        <SheetMusic musicXml={musicXml} scale={35} />
      </section>
    </div>
  )
}
