import type { SessionEndResult } from "../hooks/useSession.js"
import styles from "./ResultsOverlay.module.css"

interface ResultsOverlayProps {
  results: SessionEndResult
  onDismiss: () => void
  onRetry: () => void
}

export function ResultsOverlay({ results, onDismiss, onRetry }: ResultsOverlayProps) {
  const notePercent = Math.round(results.noteAccuracy * 100)
  const timingPercent = Math.round(results.timingAccuracy * 100)
  const overallPercent = Math.round(results.combinedScore)

  // Determine grade based on score
  const getGradeInfo = (score: number) => {
    if (score >= 95) return { label: "Perfect!", color: "var(--color-correct)" }
    if (score >= 85) return { label: "Excellent", color: "var(--color-correct)" }
    if (score >= 70) return { label: "Good", color: "var(--color-late)" }
    if (score >= 50) return { label: "Keep Practicing", color: "var(--color-late)" }
    return { label: "Try Again", color: "var(--color-wrong)" }
  }

  const gradeInfo = getGradeInfo(overallPercent)

  return (
    <div className={styles.overlay} onClick={onDismiss}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <h2 className={styles.title}>Session Complete</h2>
          <div className={styles.grade} style={{ color: gradeInfo.color }}>
            {gradeInfo.label}
          </div>
        </div>

        {/* Main Score */}
        <div className={styles.mainScore}>
          <div className={styles.scoreCircle} style={{ "--progress": overallPercent } as React.CSSProperties}>
            <div className={styles.scoreInner}>
              <span className={styles.scoreValue}>{overallPercent}</span>
              <span className={styles.scorePercent}>%</span>
            </div>
          </div>
          <span className={styles.scoreLabel}>Overall Score</span>
        </div>

        {/* Breakdown */}
        <div className={styles.breakdown}>
          <div className={styles.breakdownItem}>
            <div className={styles.breakdownHeader}>
              <span className={styles.breakdownLabel}>Note Accuracy</span>
              <span className={styles.breakdownValue}>{notePercent}%</span>
            </div>
            <div className={styles.progressBar}>
              <div
                className={styles.progressFill}
                style={{
                  width: `${notePercent}%`,
                  background: notePercent >= 70 ? "var(--color-correct)" : "var(--color-wrong)"
                }}
              />
            </div>
          </div>

          <div className={styles.breakdownItem}>
            <div className={styles.breakdownHeader}>
              <span className={styles.breakdownLabel}>Timing</span>
              <span className={styles.breakdownValue}>{timingPercent}%</span>
            </div>
            <div className={styles.progressBar}>
              <div
                className={styles.progressFill}
                style={{
                  width: `${timingPercent}%`,
                  background: timingPercent >= 70 ? "var(--color-correct)" : "var(--color-wrong)"
                }}
              />
            </div>
          </div>
        </div>

        {/* Hand Breakdown (if both hands) */}
        {results.leftHandAccuracy !== null && results.rightHandAccuracy !== null && (
          <div className={styles.handBreakdown}>
            <div className={styles.handItem}>
              <span className={styles.handLabel}>Left Hand</span>
              <span className={styles.handValue}>
                {Math.round(results.leftHandAccuracy * 100)}%
              </span>
            </div>
            <div className={styles.handItem}>
              <span className={styles.handLabel}>Right Hand</span>
              <span className={styles.handValue}>
                {Math.round(results.rightHandAccuracy * 100)}%
              </span>
            </div>
          </div>
        )}

        {/* Extra Notes */}
        {results.extraNotes > 0 && (
          <div className={styles.extraNotes}>
            <span className={styles.extraIcon}>+</span>
            <span>{results.extraNotes} extra note{results.extraNotes !== 1 ? "s" : ""} played</span>
          </div>
        )}

        {/* Actions */}
        <div className={styles.actions}>
          <button className={styles.secondaryButton} onClick={onDismiss}>
            Review Score
          </button>
          <button className={styles.primaryButton} onClick={onRetry}>
            Try Again
          </button>
        </div>
      </div>
    </div>
  )
}
