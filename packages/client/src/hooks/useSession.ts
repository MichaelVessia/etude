import { useState, useCallback, useMemo, useRef, useEffect } from "react"
import { useNoteStream, type SessionScore } from "./useNoteStream.js"

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8787"
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
  wsUrl?: string
  expectedNoteCount: number
  measureRange: [number, number]
}

export interface NoteSubmitResult {
  pitch: number
  result: "correct" | "wrong" | "extra" | "early" | "late"
  timingOffset: number
  expectedNoteTime: number | null // original startTime from piece start (for Verovio UI mapping)
}

export interface SessionEndResult {
  attemptId?: string
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
  wsConnected: boolean
  wsReady: boolean
  error: string | null
  sessionState: SessionState | null
  lastNoteResult: NoteSubmitResult | null
  results: SessionEndResult | null
  importPiece: (params: ImportPieceParams) => Promise<ImportPieceResult | null>
  startSession: (params: SessionStartParams) => Promise<SessionStartResult | null>
  submitNote: (pitch: number, velocity: number, on: boolean) => void
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
  const [wsUrl, setWsUrl] = useState<string | null>(null)
  const sessionStartTime = useRef<number>(0)
  const currentSessionId = useRef<string | null>(null)

  // WebSocket note stream
  const {
    connected: wsConnected,
    ready: wsReady,
    sendNote,
    lastResult: wsLastResult,
    error: wsError,
  } = useNoteStream(wsUrl, {
    onError: (err) => setError(err.message),
  })

  // Sync WebSocket results to local state
  useEffect(() => {
    if (wsLastResult) {
      const result: NoteSubmitResult = {
        pitch: wsLastResult.pitch,
        result: wsLastResult.result,
        timingOffset: wsLastResult.timingOffset,
        expectedNoteTime: wsLastResult.expectedNoteTime,
      }
      setLastNoteResult(result)

      // Update counts for correct notes
      if (wsLastResult.result === "correct") {
        setSessionState((prev) => {
          if (!prev) return prev
          return {
            ...prev,
            playedNoteCount: (prev.playedNoteCount ?? 0) + 1,
            matchedCount: (prev.matchedCount ?? 0) + 1,
          }
        })
      } else if (wsLastResult.result !== "extra") {
        // Track played notes (excluding extra)
        setSessionState((prev) => {
          if (!prev) return prev
          return {
            ...prev,
            playedNoteCount: (prev.playedNoteCount ?? 0) + 1,
          }
        })
      }
    }
  }, [wsLastResult])

  // Sync WebSocket error
  useEffect(() => {
    if (wsError) {
      setError(wsError)
    }
  }, [wsError])

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
    setWsUrl(null)

    try {
      // Use WebSocket session start endpoint
      const response = await fetch(`${SESSION_API}/ws/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      })

      const data = (await response.json()) as SessionStartResult & { wsUrl?: string; error?: string }

      if (!response.ok) {
        throw new Error(data.error || "Failed to start session")
      }

      sessionStartTime.current = Date.now()
      currentSessionId.current = data.sessionId

      // Set WebSocket URL to trigger connection
      if (data.wsUrl) {
        setWsUrl(data.wsUrl)
      }

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

      return data
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
      return null
    } finally {
      setIsLoading(false)
    }
  }, [])

  const submitNote = useCallback(
    (pitch: number, velocity: number, on: boolean): void => {
      if (!isActive || !wsReady) return

      // Calculate timestamp relative to session start
      const timestamp = Date.now() - sessionStartTime.current
      sendNote(pitch, velocity, timestamp, on)
    },
    [isActive, wsReady, sendNote]
  )

  const endSession = useCallback(async (): Promise<SessionEndResult | null> => {
    if (!isActive || !currentSessionId.current) return null

    setIsLoading(true)

    try {
      // Use WebSocket session end endpoint
      const response = await fetch(`${SESSION_API}/ws/${currentSessionId.current}/end`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })

      const data = (await response.json()) as {
        score: SessionScore
        missedNotes: unknown[]
        error?: string
      }

      if (!response.ok) {
        throw new Error(data.error || "Failed to end session")
      }

      // Convert WebSocket score format to SessionEndResult
      const result: SessionEndResult = {
        noteAccuracy: data.score.accuracy,
        timingAccuracy: data.score.accuracy, // WebSocket mode doesn't separate these
        combinedScore: data.score.accuracy,
        leftHandAccuracy: null,
        rightHandAccuracy: null,
        extraNotes: data.score.extra,
        missedNotes: data.missedNotes,
      }

      setResults(result)
      setIsActive(false)
      setSessionState(null)
      setWsUrl(null)
      currentSessionId.current = null

      return result
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
      return null
    } finally {
      setIsLoading(false)
    }
  }, [isActive])

  const refreshState = useCallback(async (): Promise<void> => {
    // For WebSocket mode, we don't need to refresh from server
    // State is maintained locally and via WebSocket
    if (wsUrl) return

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
  }, [wsUrl])

  // Check initial state on mount
  useEffect(() => {
    refreshState()
  }, [refreshState])

  // Return memoized object to prevent unnecessary re-renders in consumers
  return useMemo(
    () => ({
      isActive,
      isLoading,
      wsConnected,
      wsReady,
      error,
      sessionState,
      lastNoteResult,
      results,
      importPiece,
      startSession,
      submitNote,
      endSession,
      refreshState,
    }),
    [
      isActive,
      isLoading,
      wsConnected,
      wsReady,
      error,
      sessionState,
      lastNoteResult,
      results,
      importPiece,
      startSession,
      submitNote,
      endSession,
      refreshState,
    ]
  )
}
