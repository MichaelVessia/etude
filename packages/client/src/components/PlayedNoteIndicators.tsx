import styles from "./PlayedNoteIndicators.module.css"

export interface PlayedNoteIndicator {
  id: string
  pitch: number
  x: number // X position on the staff
  y: number // Y position on the staff (pre-calculated)
  result: "correct" | "wrong" | "extra"
  timestamp: number
}

interface PlayedNoteIndicatorsProps {
  notes: PlayedNoteIndicator[]
  noteSize?: { width: number; height: number }
}

export function PlayedNoteIndicators({ notes, noteSize }: PlayedNoteIndicatorsProps) {
  const width = noteSize?.width ?? 24
  const height = noteSize?.height ?? 20

  return (
    <div className={styles.container}>
      {notes.map(note => (
        <div
          key={note.id}
          className={`${styles.noteIndicator} ${styles[note.result]}`}
          style={{
            left: note.x,
            top: note.y,
            width,
            height,
          }}
        >
          <svg viewBox="0 0 24 20" className={styles.noteHead}>
            {/* Elliptical note head, tilted */}
            <ellipse
              cx="12"
              cy="10"
              rx="10"
              ry="7"
              transform="rotate(-20 12 10)"
            />
          </svg>
        </div>
      ))}
    </div>
  )
}
