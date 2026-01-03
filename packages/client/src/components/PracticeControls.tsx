import { useEffect } from "react"
import { useAudio } from "../hooks/index.js"
import styles from "./PracticeControls.module.css"

interface PracticeControlsProps {
  isActive: boolean
  isLoading: boolean
  isMidiConnected: boolean
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
