import { useAudio } from "../hooks/index.js"
import { useEffect, useCallback } from "react"

interface AudioPlayerProps {
  midiBase64: string | null
}

export function AudioPlayer({ midiBase64 }: AudioPlayerProps) {
  const { isReady, isPlaying, currentTime, tempo, setTempo, play, pause, stop, loadMidi } = useAudio()

  // Load MIDI when available
  useEffect(() => {
    if (midiBase64 && isReady) {
      loadMidi(midiBase64)
    }
  }, [midiBase64, isReady, loadMidi])

  const handleTempoChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setTempo(Number(e.target.value))
    },
    [setTempo]
  )

  if (!isReady) {
    return <div style={{ color: "#666" }}>Loading audio engine...</div>
  }

  if (!midiBase64) {
    return <div style={{ color: "#666" }}>Load a MusicXML file to enable playback</div>
  }

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${minutes}:${secs.toString().padStart(2, "0")}`
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
        {isPlaying ? (
          <button onClick={pause} style={{ padding: "0.5rem 1rem" }}>
            Pause
          </button>
        ) : (
          <button onClick={play} style={{ padding: "0.5rem 1rem" }}>
            Play
          </button>
        )}
        <button onClick={stop} style={{ padding: "0.5rem 1rem" }}>
          Stop
        </button>
        <span style={{ fontFamily: "monospace" }}>{formatTime(currentTime)}</span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <label htmlFor="tempo">Tempo:</label>
        <input
          id="tempo"
          type="range"
          min="25"
          max="200"
          value={tempo}
          onChange={handleTempoChange}
          style={{ width: "150px" }}
        />
        <span style={{ width: "50px" }}>{tempo}%</span>
      </div>
    </div>
  )
}
