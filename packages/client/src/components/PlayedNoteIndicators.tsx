import styles from "./PlayedNoteIndicators.module.css"
import type { ExtraNoteIndicator } from "../hooks/usePlayedNotes.js"

interface ExtraNoteIndicatorsProps {
  notes: ExtraNoteIndicator[]
  noteSize?: { width: number; height: number } | undefined
}

export function ExtraNoteIndicators({ notes, noteSize }: ExtraNoteIndicatorsProps) {
  const width = noteSize?.width ?? 14
  const height = noteSize?.height ?? 10

  return (
    <div className={styles.container}>
      {notes.map(note => (
        <div
          key={note.id}
          className={styles.extraIndicator}
          style={{
            left: note.x,
            top: note.y,
            width,
            height,
          }}
        >
          <svg viewBox="0 0 24 20" className={styles.noteHead}>
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
