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

// Stores position as ratio (0-1) relative to SVG for resize-resilience
interface NotePositionRatio {
  time: number
  xRatio: number // 0-1 relative to SVG width
  page: number
}

interface StaffBoundsRatio {
  yRatio: number // 0-1 relative to SVG height
  heightRatio: number // 0-1 relative to SVG height
}

export function usePlayhead(
  onTimeUpdate?: (time: number) => void,
  onEnd?: () => void,
  onPageChange?: (page: number) => void
): UsePlayheadResult {
  const [position, setPosition] = useState<PlayheadPosition | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)

  // Track note positions as ratios sorted by time
  const notePositionRatiosRef = useRef<NotePositionRatio[]>([])
  // Staff bounds as ratios
  const staffBoundsRatioRef = useRef<StaffBoundsRatio | null>(null)
  // Animation state
  const animationRef = useRef<number | null>(null)
  const startTimeRef = useRef<number>(0)
  const tempoRef = useRef<number>(100)
  const lastTimeRef = useRef<number>(0)
  const svgElementRef = useRef<SVGElement | null>(null)
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

  // Convert ratio position to pixel position using current SVG bounds
  const ratioToPixel = useCallback((xRatio: number, page: number): PlayheadPosition | null => {
    const staffBounds = staffBoundsRatioRef.current
    if (!staffBounds) return null

    // Query the SVG fresh each time to handle re-renders
    // The stored ref can become stale when React reconciles
    let svg = svgElementRef.current
    if (!svg || !svg.isConnected) {
      // Try to find the SVG in the DOM
      const wrapper = document.querySelector('[class*="svgWrapper"]')
      svg = wrapper?.querySelector('svg') ?? null
      if (svg) svgElementRef.current = svg
    }
    if (!svg) return null

    const svgBounds = svg.getBoundingClientRect()
    // Guard against zero bounds (element not yet rendered or detached)
    if (svgBounds.width === 0 || svgBounds.height === 0) return null

    return {
      x: xRatio * svgBounds.width,
      y: staffBounds.yRatio * svgBounds.height,
      height: staffBounds.heightRatio * svgBounds.height,
      page,
    }
  }, [])

  // Get position for a given time by interpolating between notes
  const getPositionAtTime = useCallback((time: number): PlayheadPosition | null => {
    const positions = notePositionRatiosRef.current
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
      return ratioToPixel(prevNote.xRatio, prevNote.page)
    }

    // If after last note, use last note position
    if (time >= nextNote.time) {
      return ratioToPixel(nextNote.xRatio, nextNote.page)
    }

    // Interpolate between notes
    const progress = (time - prevNote.time) / (nextNote.time - prevNote.time)

    // If notes are on different pages, just use the appropriate note's position
    if (prevNote.page !== nextNote.page) {
      return progress < 0.5
        ? ratioToPixel(prevNote.xRatio, prevNote.page)
        : ratioToPixel(nextNote.xRatio, nextNote.page)
    }

    const xRatio = prevNote.xRatio + (nextNote.xRatio - prevNote.xRatio) * progress
    return ratioToPixel(xRatio, prevNote.page)
  }, [ratioToPixel])

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
    const positions = notePositionRatiosRef.current
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
    svgElementRef.current = svgElement
    const svgBounds = svgElement.getBoundingClientRect()

    // Find staff elements to get vertical bounds
    // Verovio generates <g class="staff"> elements containing staff lines
    const staffElements = svgElement.querySelectorAll(".staff")
    let staffMinY = Infinity
    let staffMaxY = 0

    staffElements.forEach(staff => {
      const staffBounds = staff.getBoundingClientRect()
      const relY = staffBounds.top - svgBounds.top
      staffMinY = Math.min(staffMinY, relY)
      staffMaxY = Math.max(staffMaxY, relY + staffBounds.height)
    })

    // Fallback: if no staff elements found, derive from notes
    if (staffMinY === Infinity) {
      for (const note of noteElements) {
        const el = document.getElementById(note.elementId)
        if (!el) continue
        const bounds = el.getBoundingClientRect()
        const y = bounds.top - svgBounds.top
        staffMinY = Math.min(staffMinY, y)
        staffMaxY = Math.max(staffMaxY, y + bounds.height)
      }
    }

    // Store staff bounds as ratios
    const yRatio = staffMinY === Infinity ? 0 : staffMinY / svgBounds.height
    const heightRatio = staffMaxY > staffMinY ? (staffMaxY - staffMinY) / svgBounds.height : 0.5
    staffBoundsRatioRef.current = { yRatio, heightRatio }

    // Build note position ratios
    const positions: NotePositionRatio[] = []
    for (const note of noteElements) {
      const el = document.getElementById(note.elementId)
      if (!el) continue

      const bounds = el.getBoundingClientRect()
      // X position as ratio of SVG width (center of note)
      const xRatio = (bounds.left - svgBounds.left + bounds.width / 2) / svgBounds.width

      positions.push({
        time: note.onset,
        xRatio,
        page: note.page,
      })
    }

    // Sort by time
    positions.sort((a, b) => a.time - b.time)
    notePositionRatiosRef.current = positions

    // Set initial position
    if (positions.length > 0) {
      const first = positions[0]!
      const initialPos = ratioToPixel(first.xRatio, first.page)
      if (initialPos) {
        setPosition(initialPos)
      }
    }
  }, [ratioToPixel])

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
    const positions = notePositionRatiosRef.current
    if (positions.length > 0) {
      const first = positions[0]!
      const initialPos = ratioToPixel(first.xRatio, first.page)
      if (initialPos) {
        setPosition(initialPos)
      }
    }
  }, [stop, ratioToPixel])

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
