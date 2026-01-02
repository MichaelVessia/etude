import { useCallback, useMemo, useRef, useState, useEffect } from "react"
import type { NoteElementInfo } from "./useVerovio.js"

export interface PlayheadPosition {
  x: number
  y: number
  height: number
  page: number
}

export interface UsePlayheadResult {
  // Current playhead position
  position: PlayheadPosition | null
  // Whether playhead is active
  isRunning: boolean
  // Current time in milliseconds
  currentTime: number
  // Initialize with note positions
  initialize: (noteElements: NoteElementInfo[], svgElement: SVGElement) => void
  // Start playhead from first note
  start: (tempoPercent: number) => void
  // Stop playhead
  stop: () => void
  // Reset to beginning
  reset: () => void
}

interface NotePosition {
  time: number
  x: number
  y: number
  height: number
  page: number
}

export function usePlayhead(
  onTimeUpdate?: (time: number) => void,
  onEnd?: () => void,
  onPageChange?: (page: number) => void
): UsePlayheadResult {
  const [position, setPosition] = useState<PlayheadPosition | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)

  // Track note positions sorted by time
  const notePositionsRef = useRef<NotePosition[]>([])
  // Animation state
  const animationRef = useRef<number | null>(null)
  const startTimeRef = useRef<number>(0)
  const tempoRef = useRef<number>(100)
  const lastTimeRef = useRef<number>(0)
  const svgBoundsRef = useRef<DOMRect | null>(null)
  const isRunningRef = useRef(false)
  const currentPageRef = useRef(1)

  // Helper to stop animation (used by animate callback)
  const stopAnimation = useCallback(() => {
    isRunningRef.current = false
    setIsRunning(false)
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
      animationRef.current = null
    }
  }, [])

  // Get X position for a given time by interpolating between notes
  const getPositionAtTime = useCallback((time: number): PlayheadPosition | null => {
    const positions = notePositionsRef.current
    if (positions.length === 0) return null

    // Find the two notes we're between
    let prevNote = positions[0]!
    let nextNote = positions[positions.length - 1]!

    for (let i = 0; i < positions.length; i++) {
      if (positions[i]!.time > time) {
        nextNote = positions[i]!
        if (i > 0) prevNote = positions[i - 1]!
        break
      }
      prevNote = positions[i]!
    }

    // If before first note, use first note position
    if (time <= prevNote.time) {
      return {
        x: prevNote.x,
        y: prevNote.y,
        height: prevNote.height,
        page: prevNote.page,
      }
    }

    // If after last note, use last note position
    if (time >= nextNote.time) {
      return {
        x: nextNote.x,
        y: nextNote.y,
        height: nextNote.height,
        page: nextNote.page,
      }
    }

    // Interpolate between notes
    const progress = (time - prevNote.time) / (nextNote.time - prevNote.time)

    // If notes are on different pages, just use the appropriate note's position
    if (prevNote.page !== nextNote.page) {
      return progress < 0.5
        ? { x: prevNote.x, y: prevNote.y, height: prevNote.height, page: prevNote.page }
        : { x: nextNote.x, y: nextNote.y, height: nextNote.height, page: nextNote.page }
    }

    return {
      x: prevNote.x + (nextNote.x - prevNote.x) * progress,
      y: Math.min(prevNote.y, nextNote.y),
      height: Math.max(prevNote.height, nextNote.height),
      page: prevNote.page,
    }
  }, [])

  // Animation frame callback
  const animate = useCallback(() => {
    if (!isRunningRef.current) return

    const now = performance.now()
    const elapsed = now - startTimeRef.current
    // Adjust elapsed time by tempo (100% = normal speed)
    const adjustedTime = elapsed * (tempoRef.current / 100)

    setCurrentTime(adjustedTime)
    lastTimeRef.current = adjustedTime
    onTimeUpdate?.(adjustedTime)

    const newPosition = getPositionAtTime(adjustedTime)
    if (newPosition) {
      setPosition(newPosition)
      // Check for page change
      if (newPosition.page !== currentPageRef.current) {
        currentPageRef.current = newPosition.page
        onPageChange?.(newPosition.page)
      }
    }

    // Check if we've reached the end
    const positions = notePositionsRef.current
    if (positions.length > 0) {
      const lastNote = positions[positions.length - 1]!
      // Add some buffer time after last note
      if (adjustedTime > lastNote.time + 2000) {
        stopAnimation()
        onEnd?.()
        return
      }
    }

    animationRef.current = requestAnimationFrame(animate)
  }, [getPositionAtTime, onTimeUpdate, onEnd, onPageChange, stopAnimation])

  // Start animation loop when running
  useEffect(() => {
    if (isRunning) {
      animationRef.current = requestAnimationFrame(animate)
    }
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [isRunning, animate])

  // Initialize with note positions from Verovio
  const initialize = useCallback((noteElements: NoteElementInfo[], svgElement: SVGElement) => {
    const positions: NotePosition[] = []
    const svgBounds = svgElement.getBoundingClientRect()
    svgBoundsRef.current = svgBounds

    // Calculate full staff height (min Y to max Y+height of all notes)
    let minY = Infinity
    let maxY = 0

    for (const note of noteElements) {
      const el = document.getElementById(note.elementId)
      if (!el) continue

      const bounds = el.getBoundingClientRect()
      // Convert to coordinates relative to SVG
      const x = bounds.left - svgBounds.left + bounds.width / 2
      const y = bounds.top - svgBounds.top
      const height = bounds.height

      // Track vertical extent
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y + height)

      positions.push({
        time: note.onset,
        x,
        y,
        height,
        page: note.page,
      })
    }

    // Calculate fixed Y and height to span all notes
    const fixedY = minY === Infinity ? 0 : minY
    const fixedHeight = maxY > minY ? maxY - minY : 100

    // Update positions to use consistent Y/height (playhead spans full staff)
    for (const pos of positions) {
      pos.y = fixedY
      pos.height = fixedHeight
    }

    // Sort by time
    positions.sort((a, b) => a.time - b.time)
    notePositionsRef.current = positions

    // Set initial position
    if (positions.length > 0) {
      const first = positions[0]!
      setPosition({
        x: first.x,
        y: first.y,
        height: first.height,
        page: first.page,
      })
    }
  }, [])

  // Start playhead
  const start = useCallback((tempoPercent: number) => {
    tempoRef.current = tempoPercent
    startTimeRef.current = performance.now() - (lastTimeRef.current * 100 / tempoPercent)
    isRunningRef.current = true
    setIsRunning(true)
  }, [])

  // Stop playhead
  const stop = useCallback(() => {
    stopAnimation()
  }, [stopAnimation])

  // Reset to beginning
  const reset = useCallback(() => {
    stop()
    setCurrentTime(0)
    lastTimeRef.current = 0
    currentPageRef.current = 1
    const positions = notePositionsRef.current
    if (positions.length > 0) {
      const first = positions[0]!
      setPosition({
        x: first.x,
        y: first.y,
        height: first.height,
        page: first.page,
      })
    }
  }, [stop])

  // Return memoized object - changes when state or methods change
  return useMemo(() => ({
    position,
    isRunning,
    currentTime,
    initialize,
    start,
    stop,
    reset,
  }), [position, isRunning, currentTime, initialize, start, stop, reset])
}
