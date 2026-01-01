interface PlayheadProps {
  x: number
  y: number
  height: number
  visible: boolean
}

export function Playhead({ x, y, height, visible }: PlayheadProps) {
  if (!visible) return null

  return (
    <div
      style={{
        position: "absolute",
        left: `${x}px`,
        top: `${y}px`,
        width: "2px",
        height: `${height}px`,
        backgroundColor: "rgba(37, 99, 235, 0.8)", // blue-600 with 80% opacity
        pointerEvents: "none",
        zIndex: 10,
        // No transition - RAF handles smooth animation
      }}
    />
  )
}
