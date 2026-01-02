import { useState, useCallback, useMemo, useRef, useEffect } from "react"

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3001"
const SESSION_API = `${API_BASE}/api/session`
const PIECE_API = `${API_BASE}/api/piece`

export type Hand = "left" | "right" | "both"

export interface SessionStartParams {
  pieceId: string
  measureStart: number
  measureEnd: number
  hand: Hand
  tempo: number
}

export interface SessionStartResult {
  sessionId: string
  expectedNoteCount: number
  measureRange: [number, number]
}

export interface NoteSubmitResult {
  pitch: number
  result: "correct" | "wrong" | "extra"
  timingOffset: number
  expectedNoteTime: number | null // original startTime from piece start (for Verovio UI mapping)
}

export interface SessionEndResult {
  attemptId: string
  noteAccuracy: number
  timingAccuracy: number
  combinedScore: number
  leftHandAccuracy: number | null
  rightHandAccuracy: number | null
  extraNotes: number
  missedNotes: unknown[]
}

export interface SessionState {
  active: boolean
  sessionId?: string
  pieceId?: string
  expectedNoteCount?: number
  playedNoteCount?: number
  matchedCount?: number
  measureRange?: [number, number]
  hand?: Hand
  tempo?: number
}

export interface ImportPieceParams {
  id: string
  xml: string
  filePath: string
}

export interface ImportPieceResult {
  id: string
  name: string
  totalMeasures: number
  noteCount?: number
  alreadyExists?: boolean
}

export interface UseSessionResult {
  isActive: boolean
  isLoading: boolean
  error: string | null
  sessionState: SessionState | null
  lastNoteResult: NoteSubmitResult | null
  results: SessionEndResult | null
  importPiece: (params: ImportPieceParams) => Promise<ImportPieceResult | null>
  startSession: (params: SessionStartParams) => Promise<SessionStartResult | null>
  submitNote: (pitch: number, velocity: number, on: boolean) => Promise<NoteSubmitResult | null>
  endSession: () => Promise<SessionEndResult | null>
  refreshState: () => Promise<void>
}

export function useSession(): UseSessionResult {
  const [isActive, setIsActive] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sessionState, setSessionState] = useState<SessionState | null>(null)
  const [lastNoteResult, setLastNoteResult] = useState<NoteSubmitResult | null>(null)
  const [results, setResults] = useState<SessionEndResult | null>(null)
  const sessionStartTime = useRef<number>(0)

  const importPiece = useCallback(async (params: ImportPieceParams): Promise<ImportPieceResult | null> => {
    try {
      const response = await fetch(`${PIECE_API}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to import piece")
      }

      return data as ImportPieceResult
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
      return null
    }
  }, [])

  const startSession = useCallback(async (params: SessionStartParams): Promise<SessionStartResult | null> => {
    setIsLoading(true)
    setError(null)
    setResults(null)
    setLastNoteResult(null)

    try {
      const response = await fetch(`${SESSION_API}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to start session")
      }

      sessionStartTime.current = Date.now()
      setIsActive(true)
      setSessionState({
        active: true,
        sessionId: data.sessionId,
        pieceId: params.pieceId,
        expectedNoteCount: data.expectedNoteCount,
        playedNoteCount: 0,
        matchedCount: 0,
        measureRange: data.measureRange,
        hand: params.hand,
        tempo: params.tempo,
      })

      return data as SessionStartResult
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
      return null
    } finally {
      setIsLoading(false)
    }
  }, [])

  const submitNote = useCallback(async (
    pitch: number,
    velocity: number,
    on: boolean
  ): Promise<NoteSubmitResult | null> => {
    if (!isActive) return null

    // Calculate timestamp relative to session start
    const timestamp = Date.now() - sessionStartTime.current

    try {
      const response = await fetch(`${SESSION_API}/note`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pitch, velocity, timestamp, on }),
      })

      const data = await response.json()

      if (!response.ok) {
        console.error("Note submit error:", data.error)
        return null
      }

      const result = data as NoteSubmitResult
      setLastNoteResult(result)

      // Update local session state counts
      if (on) {
        setSessionState((prev) => {
          if (!prev) return prev
          const newMatchedCount = result.result === "correct"
            ? (prev.matchedCount ?? 0) + 1
            : (prev.matchedCount ?? 0)
          return {
            ...prev,
            playedNoteCount: (prev.playedNoteCount ?? 0) + 1,
            matchedCount: newMatchedCount,
          }
        })
      }

      return result
    } catch (err) {
      console.error("Note submit failed:", err)
      return null
    }
  }, [isActive])

  const endSession = useCallback(async (): Promise<SessionEndResult | null> => {
    if (!isActive) return null

    setIsLoading(true)

    try {
      const response = await fetch(`${SESSION_API}/end`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to end session")
      }

      const result = data as SessionEndResult
      setResults(result)
      setIsActive(false)
      setSessionState(null)

      return result
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
      return null
    } finally {
      setIsLoading(false)
    }
  }, [isActive])

  const refreshState = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch(`${SESSION_API}/state`)
      const data = await response.json()

      if (response.ok) {
        setSessionState(data as SessionState)
        setIsActive(data.active)
      }
    } catch (err) {
      console.error("Failed to refresh state:", err)
    }
  }, [])

  // Check initial state on mount
  useEffect(() => {
    refreshState()
  }, [refreshState])

  // Return memoized object to prevent unnecessary re-renders in consumers
  return useMemo(() => ({
    isActive,
    isLoading,
    error,
    sessionState,
    lastNoteResult,
    results,
    importPiece,
    startSession,
    submitNote,
    endSession,
    refreshState,
  }), [isActive, isLoading, error, sessionState, lastNoteResult, results, importPiece, startSession, submitNote, endSession, refreshState])
}
