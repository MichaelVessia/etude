import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Effect } from "effect"
import {
  useRuntime,
  SessionRpcClient,
  sessionCompleteToResults,
  type SessionState,
  type SessionResultsState,
} from "../runtime/index.js"
import { useNoteStream, type SessionScore, type NoteResult } from "./useNoteStream.js"
import type { Hand } from "@etude/shared"

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8787"

export interface SessionStartParams {
  pieceId: string
  measureStart: number
  measureEnd: number
  hand: Hand
  tempo: number
}

export interface UseSessionRpcResult {
  isActive: boolean
  isLoading: boolean
  wsConnected: boolean
  wsReady: boolean
  error: string | null
  sessionState: SessionState | null
  lastNoteResult: NoteResult | null
  results: SessionResultsState | null
  startSession: (params: SessionStartParams) => Promise<boolean>
  submitNote: (pitch: number, velocity: number, on: boolean) => void
  endSession: () => Promise<SessionResultsState | null>
}

/**
 * Hook for session management using RPC for start/end and WebSocket for notes.
 * This is the Phase 2 implementation that uses Effect RPC for HTTP endpoints.
 */
export function useSessionRpc(): UseSessionRpcResult {
  const runtime = useRuntime()
  const [wsUrl, setWsUrl] = useState<string | null>(null)
  const sessionStartTime = useRef<number>(0)
  const currentSessionId = useRef<string | null>(null)

  // Local state (simpler than atoms for now)
  const [isActive, setIsActive] = useState(false)
  const [sessionState, setSessionState] = useState<SessionState | null>(null)
  const [lastNoteResult, setLastNoteResult] = useState<NoteResult | null>(null)
  const [results, setResults] = useState<SessionResultsState | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // WebSocket note stream (still uses WS for real-time performance)
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
      setLastNoteResult(wsLastResult)

      // Update counts
      if (wsLastResult.result === "correct") {
        setSessionState((prev) => {
          if (!prev) return prev
          return {
            ...prev,
            playedNoteCount: prev.playedNoteCount + 1,
            matchedCount: prev.matchedCount + 1,
          }
        })
      } else if (wsLastResult.result !== "extra") {
        setSessionState((prev) => {
          if (!prev) return prev
          return {
            ...prev,
            playedNoteCount: prev.playedNoteCount + 1,
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

  const startSession = useCallback(
    async (params: SessionStartParams): Promise<boolean> => {
      setIsLoading(true)
      setError(null)
      setResults(null)
      setLastNoteResult(null)
      setWsUrl(null)

      try {
        // Use WebSocket session start for now (Phase 3 will replace this)
        // RPC startSession doesn't return wsUrl, so we still need the WS endpoint
        const response = await fetch(`${API_BASE}/api/session/ws/start`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(params),
        })

        const data = await response.json() as {
          sessionId: string
          wsUrl?: string
          expectedNoteCount: number
          measureRange: [number, number]
          error?: string
        }

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
          sessionId: data.sessionId,
          pieceId: params.pieceId,
          expectedNoteCount: data.expectedNoteCount,
          playedNoteCount: 0,
          matchedCount: 0,
          measureRange: data.measureRange,
          hand: params.hand,
          tempo: params.tempo,
        })

        setIsLoading(false)
        return true
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error")
        setIsLoading(false)
        return false
      }
    },
    []
  )

  const submitNote = useCallback(
    (pitch: number, velocity: number, on: boolean): void => {
      if (!isActive || !wsReady) return

      const timestamp = Date.now() - sessionStartTime.current
      sendNote(pitch, velocity, timestamp, on)
    },
    [isActive, wsReady, sendNote]
  )

  const endSession = useCallback(async (): Promise<SessionResultsState | null> => {
    if (!isActive || !currentSessionId.current) return null

    setIsLoading(true)

    try {
      // Use RPC for end session
      const effect = Effect.gen(function* () {
        const client = yield* SessionRpcClient
        return yield* client.endSession()
      })

      const result = await runtime.runPromise(effect)
      const resultState = sessionCompleteToResults(result)

      setResults(resultState)
      setIsActive(false)
      setSessionState(null)
      setWsUrl(null)
      currentSessionId.current = null

      setIsLoading(false)
      return resultState
    } catch {
      // Fallback to WebSocket end if RPC fails
      try {
        const response = await fetch(`${API_BASE}/api/session/ws/${currentSessionId.current}/end`, {
          method: "POST",
        })

        const data = await response.json() as {
          score: SessionScore
          missedNotes: unknown[]
          error?: string
        }

        if (!response.ok) {
          throw new Error(data.error || "Failed to end session")
        }

        const resultState: SessionResultsState = {
          attemptId: "",
          noteAccuracy: data.score.accuracy,
          timingAccuracy: data.score.accuracy,
          combinedScore: data.score.accuracy,
          leftHandAccuracy: null,
          rightHandAccuracy: null,
          extraNotes: data.score.extra,
          missedNotes: data.missedNotes,
        }

        setResults(resultState)
        setIsActive(false)
        setSessionState(null)
        setWsUrl(null)
        currentSessionId.current = null

        setIsLoading(false)
        return resultState
      } catch (fallbackErr) {
        setError(fallbackErr instanceof Error ? fallbackErr.message : "Unknown error")
        setIsLoading(false)
        return null
      }
    }
  }, [isActive, runtime])

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
      startSession,
      submitNote,
      endSession,
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
      startSession,
      submitNote,
      endSession,
    ]
  )
}
