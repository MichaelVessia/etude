import styles from "./MidiStatusBadge.module.css"

interface MidiStatusBadgeProps {
  isConnected: boolean
  deviceName?: string | undefined
  onClick?: () => void
}

export function MidiStatusBadge({ isConnected, deviceName, onClick }: MidiStatusBadgeProps) {
  return (
    <button
      className={`${styles.badge} ${isConnected ? styles.connected : styles.disconnected}`}
      onClick={onClick}
      type="button"
    >
      <span className={styles.indicator} />
      <span className={styles.label}>
        {isConnected ? (deviceName ?? "MIDI Connected") : "No MIDI Device"}
      </span>
      <svg
        className={styles.chevron}
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  )
}
