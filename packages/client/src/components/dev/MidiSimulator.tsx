import { useState } from "react"

interface MidiSimulatorProps {
  onNote: (pitch: number) => void
}

/**
 * Dev-only MIDI simulator for testing without a physical keyboard
 */
export function MidiSimulator({ onNote }: MidiSimulatorProps) {
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
