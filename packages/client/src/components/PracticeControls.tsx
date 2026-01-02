import { useCallback, useEffect } from "react"
import { useAudio } from "../hooks/index.js"
import type { Hand } from "../hooks/useSession.js"
import styles from "./PracticeControls.module.css"

interface PracticeControlsProps {
  isActive: boolean
  isLoading: boolean
  isMidiConnected: boolean
  tempo: number
  onTempoChange: (tempo: number) => void
  selectedHand: Hand
  onHandChange: (hand: Hand) => void
  measureStart: number
  measureEnd: number
  maxMeasure: number
  onMeasureStartChange: (measure: number) => void
  onMeasureEndChange: (measure: number) => void
  onStart: () => void
  onStop: () => void
  midiBase64: string | null
  sessionStats?: {
    playedNotes: number
    expectedNotes: number
    matchedNotes: number
  } | undefined
}

export function PracticeControls({
  isActive,
  isLoading,
  isMidiConnected,
  tempo,
  onTempoChange,
  selectedHand,
  onHandChange,
  measureStart,
  measureEnd,
  maxMeasure,
  onMeasureStartChange,
  onMeasureEndChange,
  onStart,
  onStop,
  midiBase64,
  sessionStats,
}: PracticeControlsProps) {
  const audio = useAudio()

  // Load MIDI data for playback
  useEffect(() => {
    if (midiBase64 && audio.isReady) {
      audio.loadMidi(midiBase64)
    }
  }, [midiBase64, audio])

  const handleTempoChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onTempoChange(Number(e.target.value))
    },
    [onTempoChange]
  )

  const canStart = isMidiConnected && !isLoading && midiBase64

  return (
    <div className={styles.container}>
      <div className={styles.controlBar}>
        {/* Left Section - Playback */}
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Listen</div>
          <div className={styles.playbackControls}>
            {audio.isPlaying ? (
              <button
                className={styles.iconButton}
                onClick={audio.pause}
                title="Pause"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="4" width="4" height="16" rx="1" />
                  <rect x="14" y="4" width="4" height="16" rx="1" />
                </svg>
              </button>
            ) : (
              <button
                className={styles.iconButton}
                onClick={audio.play}
                disabled={!midiBase64 || isActive}
                title="Play"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </button>
            )}
            <button
              className={styles.iconButton}
              onClick={audio.stop}
              disabled={!midiBase64}
              title="Stop"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="1" />
              </svg>
            </button>
          </div>
        </div>

        {/* Divider */}
        <div className={styles.divider} />

        {/* Center Section - Settings */}
        <div className={styles.section}>
          <div className={styles.settingsRow}>
            {/* Tempo */}
            <div className={styles.control}>
              <label className={styles.controlLabel}>Tempo</label>
              <div className={styles.sliderGroup}>
                <input
                  type="range"
                  min="25"
                  max="150"
                  value={tempo}
                  onChange={handleTempoChange}
                  disabled={isActive}
                  className={styles.slider}
                />
                <span className={styles.sliderValue}>{tempo}%</span>
              </div>
            </div>

            {/* Hand Selection */}
            <div className={styles.control}>
              <label className={styles.controlLabel}>Hand</label>
              <div className={styles.segmentedControl}>
                {(["left", "both", "right"] as Hand[]).map((hand) => (
                  <button
                    key={hand}
                    className={`${styles.segment} ${selectedHand === hand ? styles.segmentActive : ""}`}
                    onClick={() => onHandChange(hand)}
                    disabled={isActive}
                  >
                    {hand === "left" ? "L" : hand === "right" ? "R" : "Both"}
                  </button>
                ))}
              </div>
            </div>

            {/* Measures */}
            <div className={styles.control}>
              <label className={styles.controlLabel}>Measures</label>
              <div className={styles.measureInputs}>
                <input
                  type="number"
                  min={1}
                  max={measureEnd}
                  value={measureStart}
                  onChange={(e) => onMeasureStartChange(Math.max(1, Math.min(measureEnd, Number(e.target.value))))}
                  disabled={isActive}
                  className={styles.measureInput}
                />
                <span className={styles.measureSeparator}>-</span>
                <input
                  type="number"
                  min={measureStart}
                  max={maxMeasure}
                  value={measureEnd}
                  onChange={(e) => onMeasureEndChange(Math.max(measureStart, Math.min(maxMeasure, Number(e.target.value))))}
                  disabled={isActive}
                  className={styles.measureInput}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className={styles.divider} />

        {/* Right Section - Start/Stop & Stats */}
        <div className={styles.section}>
          {isActive && sessionStats && (
            <div className={styles.stats}>
              <div className={styles.stat}>
                <span className={styles.statValue}>{sessionStats.matchedNotes}</span>
                <span className={styles.statLabel}>Matched</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statValue}>{sessionStats.playedNotes}</span>
                <span className={styles.statLabel}>Played</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statValue}>{sessionStats.expectedNotes}</span>
                <span className={styles.statLabel}>Expected</span>
              </div>
            </div>
          )}

          {isActive ? (
            <button
              className={`${styles.mainButton} ${styles.stopButton}`}
              onClick={onStop}
              disabled={isLoading}
            >
              {isLoading ? "Ending..." : "End Practice"}
            </button>
          ) : (
            <button
              className={`${styles.mainButton} ${styles.startButton}`}
              onClick={onStart}
              disabled={!canStart}
            >
              {isLoading ? "Starting..." : "Start Practice"}
            </button>
          )}
        </div>
      </div>

      {/* MIDI Warning */}
      {!isMidiConnected && (
        <div className={styles.warning}>
          Connect a MIDI device to start practicing
        </div>
      )}
    </div>
  )
}
