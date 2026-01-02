import styles from "./CountdownOverlay.module.css"

interface CountdownOverlayProps {
  value: number
}

export function CountdownOverlay({ value }: CountdownOverlayProps) {
  return (
    <div className={styles.overlay}>
      <div className={styles.countdownWrapper} key={value}>
        <span className={styles.countdown}>{value}</span>
      </div>
      <span className={styles.hint}>Get ready to play...</span>
    </div>
  )
}
