import { useState, useCallback } from "react"
import { useLocation } from "wouter"
import { MidiStatusBadge } from "../components/MidiStatusBadge.js"
import type { UseMidiResult } from "../hooks/index.js"
import styles from "./Library.module.css"

interface PieceInfo {
  id: string
  title: string
  composer: string
  path: string
  difficulty?: "beginner" | "intermediate" | "advanced"
  measures?: number
}

const bundledPieces: PieceInfo[] = [
  {
    id: "c-major-scale",
    title: "C Major Scale",
    composer: "Exercise",
    path: "/pieces/c-major-scale.xml",
    difficulty: "beginner",
    measures: 4
  },
  {
    id: "twinkle",
    title: "Twinkle Twinkle Little Star",
    composer: "Traditional",
    path: "/pieces/twinkle.xml",
    difficulty: "beginner",
    measures: 24
  },
  {
    id: "simple-melody",
    title: "Simple Melody",
    composer: "Test",
    path: "/pieces/simple-melody.xml",
    difficulty: "beginner",
    measures: 8
  },
]

interface LibraryProps {
  midi: UseMidiResult
  onSelectDevice: (id: string | null) => void
}

export function Library({ midi, onSelectDevice }: LibraryProps) {
  const [, navigate] = useLocation()
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showDeviceSelector, setShowDeviceSelector] = useState(false)

  const loadPiece = useCallback(async (piece: PieceInfo) => {
    setLoading(piece.id)
    setError(null)

    try {
      const response = await fetch(piece.path)
      if (!response.ok) {
        throw new Error(`Failed to load: ${response.statusText}`)
      }
      const xml = await response.text()

      // Store in sessionStorage for the practice page
      sessionStorage.setItem("etude:currentPiece", JSON.stringify({
        ...piece,
        xml,
      }))

      // Navigate to practice page
      navigate(`/practice/${piece.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load piece")
    } finally {
      setLoading(null)
    }
  }, [navigate])

  const getDifficultyLabel = (diff?: string) => {
    switch (diff) {
      case "beginner": return "Beginner"
      case "intermediate": return "Intermediate"
      case "advanced": return "Advanced"
      default: return null
    }
  }

  return (
    <div className={styles.container}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <div className={styles.logo}>
            <span className={styles.logoText}>Etude</span>
            <span className={styles.logoSubtext}>Piano Practice</span>
          </div>

          <div className={styles.headerActions}>
            <div className={styles.deviceSelector}>
              <MidiStatusBadge
                isConnected={midi.isConnected}
                deviceName={midi.selectedDevice?.name}
                onClick={() => setShowDeviceSelector(!showDeviceSelector)}
              />

              {showDeviceSelector && (
                <div className={styles.deviceDropdown}>
                  <div className={styles.deviceDropdownHeader}>Select MIDI Device</div>
                  {midi.devices.length === 0 ? (
                    <div className={styles.deviceEmpty}>
                      No MIDI devices found. Connect a keyboard and refresh.
                    </div>
                  ) : (
                    <div className={styles.deviceList}>
                      {midi.devices.map((device) => (
                        <button
                          key={device.id}
                          className={`${styles.deviceItem} ${midi.selectedDevice?.id === device.id ? styles.deviceItemActive : ""}`}
                          onClick={() => {
                            onSelectDevice(device.id)
                            setShowDeviceSelector(false)
                          }}
                        >
                          <span className={styles.deviceName}>{device.name}</span>
                          {device.manufacturer && (
                            <span className={styles.deviceMfg}>{device.manufacturer}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className={styles.main}>
        <div className={styles.intro}>
          <h1 className={styles.title}>Your Library</h1>
          <p className={styles.subtitle}>
            Select a piece to begin practicing. Sheet music will display full-screen
            with real-time feedback as you play.
          </p>
        </div>

        {error && (
          <div className={styles.error}>{error}</div>
        )}

        {/* MIDI Warning */}
        {!midi.isSupported && (
          <div className={styles.warning}>
            Web MIDI is not supported in this browser. Please use Chrome or Edge.
          </div>
        )}

        {/* Piece Grid */}
        <div className={styles.grid}>
          {bundledPieces.map((piece) => (
            <button
              key={piece.id}
              className={styles.pieceCard}
              onClick={() => loadPiece(piece)}
              disabled={loading !== null}
            >
              <div className={styles.pieceCardInner}>
                {/* Music staff decoration */}
                <div className={styles.pieceCardStaff}>
                  <div className={styles.staffLine} />
                  <div className={styles.staffLine} />
                  <div className={styles.staffLine} />
                  <div className={styles.staffLine} />
                  <div className={styles.staffLine} />
                </div>

                <div className={styles.pieceContent}>
                  <h3 className={styles.pieceTitle}>{piece.title}</h3>
                  <p className={styles.pieceComposer}>{piece.composer}</p>

                  <div className={styles.pieceMeta}>
                    {getDifficultyLabel(piece.difficulty) && (
                      <span className={`${styles.badge} ${styles[`badge${piece.difficulty}`]}`}>
                        {getDifficultyLabel(piece.difficulty)}
                      </span>
                    )}
                    {piece.measures && (
                      <span className={styles.measures}>{piece.measures} measures</span>
                    )}
                  </div>
                </div>

                {loading === piece.id && (
                  <div className={styles.pieceLoading}>
                    <div className={styles.spinner} />
                  </div>
                )}
              </div>
            </button>
          ))}

          {/* Upload Card */}
          <label className={styles.uploadCard}>
            <input
              type="file"
              accept=".xml,.musicxml"
              className={styles.uploadInput}
              onChange={async (e) => {
                const file = e.target.files?.[0]
                if (!file) return

                const reader = new FileReader()
                reader.onload = (ev) => {
                  const xml = ev.target?.result
                  if (typeof xml === "string") {
                    const customPiece = {
                      id: `custom-${Date.now()}`,
                      title: file.name.replace(/\.(xml|musicxml)$/, ""),
                      composer: "Custom",
                      path: "",
                      xml,
                    }
                    sessionStorage.setItem("etude:currentPiece", JSON.stringify(customPiece))
                    navigate(`/practice/${customPiece.id}`)
                  }
                }
                reader.readAsText(file)
              }}
            />
            <div className={styles.uploadCardInner}>
              <div className={styles.uploadIcon}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                </svg>
              </div>
              <span className={styles.uploadText}>Add MusicXML</span>
              <span className={styles.uploadHint}>Upload your own sheet music</span>
            </div>
          </label>
        </div>
      </main>
    </div>
  )
}
