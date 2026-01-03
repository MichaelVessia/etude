import { useState, useCallback, useRef, useEffect } from "react"
import type { WsServerMessage, WsClientMessage } from "@etude/shared"

export interface NoteResult {
  pitch: number
  result: "correct" | "early" | "late" | "extra" | "wrong"
  timingOffset: number
  expectedNoteTime: number | null
}

export interface SessionScore {
  correct: number
  early: number
  late: number
  extra: number
  missed: number
  accuracy: number
}

export interface UseNoteStreamOptions {
  maxRetries?: number
  onError?: (error: Error) => void
  onClose?: () => void
}

export interface UseNoteStreamResult {
  connected: boolean
  ready: boolean
  sendNote: (pitch: number, velocity: number, timestamp: number, on: boolean) => void
  lastResult: NoteResult | null
  sessionScore: SessionScore | null
  error: string | null
}

export function useNoteStream(
  wsUrl: string | null,
  options: UseNoteStreamOptions = {}
): UseNoteStreamResult {
  const { maxRetries = 3, onError, onClose } = options

  const wsRef = useRef<WebSocket | null>(null)
  const retryCount = useRef(0)
  const retryTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Use refs for callbacks to avoid reconnection loops when callbacks change
  const onErrorRef = useRef(onError)
  const onCloseRef = useRef(onClose)
  onErrorRef.current = onError
  onCloseRef.current = onClose

  const [connected, setConnected] = useState(false)
  const [ready, setReady] = useState(false)
  const [lastResult, setLastResult] = useState<NoteResult | null>(null)
  const [sessionScore, setSessionScore] = useState<SessionScore | null>(null)
  const [error, setError] = useState<string | null>(null)

  const cleanup = useCallback(() => {
    if (retryTimeout.current) {
      clearTimeout(retryTimeout.current)
      retryTimeout.current = null
    }
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    setConnected(false)
    setReady(false)
  }, [])

  const connect = useCallback(() => {
    if (!wsUrl) return

    cleanup()
    setError(null)

    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
      retryCount.current = 0
    }

    ws.onclose = (event) => {
      setConnected(false)
      setReady(false)

      // Only retry on unexpected close (not clean close code 1000)
      if (event.code !== 1000 && retryCount.current < maxRetries) {
        retryCount.current++
        const delay = 1000 * retryCount.current // exponential backoff
        retryTimeout.current = setTimeout(() => {
          connect()
        }, delay)
      } else if (event.code !== 1000) {
        setError("Connection failed after retries")
        onErrorRef.current?.(new Error("Connection failed after retries"))
      }

      onCloseRef.current?.()
    }

    ws.onerror = () => {
      // Error event doesn't provide useful info - onclose will handle retry
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as WsServerMessage

        switch (data.type) {
          case "ready":
            setReady(true)
            break

          case "result":
            setLastResult({
              pitch: data.pitch,
              result: data.result,
              timingOffset: data.timingOffset,
              expectedNoteTime: data.expectedNoteTime,
            })
            break

          case "sessionEnd":
            setSessionScore(data.score)
            break

          case "ping":
            // Respond to server ping
            if (ws.readyState === WebSocket.OPEN) {
              const pong: WsClientMessage = { type: "pong" }
              ws.send(JSON.stringify(pong))
            }
            break

          case "error":
            // Recoverable error from server
            console.error("Server error:", data.message)
            break

          default:
            console.warn("Unknown message type:", data)
        }
      } catch (e) {
        console.error("Failed to parse WebSocket message:", e)
        // Log + ignore per spec
      }
    }
  }, [wsUrl, maxRetries, cleanup]) // Removed onError, onClose - using refs instead

  // Connect when wsUrl changes
  useEffect(() => {
    if (wsUrl) {
      connect()
    }

    return cleanup
  }, [wsUrl, connect, cleanup])

  const sendNote = useCallback(
    (pitch: number, velocity: number, timestamp: number, on: boolean) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        const msg: WsClientMessage = { type: "note", pitch, velocity, timestamp, on }
        wsRef.current.send(JSON.stringify(msg))
      }
    },
    []
  )

  return {
    connected,
    ready,
    sendNote,
    lastResult,
    sessionScore,
    error,
  }
}
