import type { DurableObjectState, WebSocket as CFWebSocket } from "@cloudflare/workers-types"
import type { NoteEvent, PlayedNote, PieceId, Hand } from "@etude/shared"
import {
  Milliseconds,
  MidiPitch,
  Velocity,
  WsClientMessage,
  WsReadyMessage,
  WsResultMessage,
  WsPingMessage,
  WsSessionEndMessage,
  WsRestoreMessage,
  matchNote as sharedMatchNote,
  DEFAULT_CONFIG,
} from "@etude/shared"
import { Option, Schema } from "effect"

// Schema decoders/encoders for type-safe WebSocket messages
const decodeClientMessage = Schema.decodeUnknownSync(WsClientMessage)
const encodeReadyMessage = Schema.encodeSync(WsReadyMessage)
const encodeResultMessage = Schema.encodeSync(WsResultMessage)
const encodePingMessage = Schema.encodeSync(WsPingMessage)
const encodeSessionEndMessage = Schema.encodeSync(WsSessionEndMessage)
const encodeRestoreMessage = Schema.encodeSync(WsRestoreMessage)

// WebSocketPair is a global in Cloudflare Workers runtime
declare const WebSocketPair: {
  new (): { 0: CFWebSocket; 1: CFWebSocket }
}

/**
 * In-memory session state during WebSocket connection.
 * Not serialized - lives only while WebSocket is active.
 */
export interface SessionState {
  sessionId: string
  pieceId: PieceId
  expectedNotes: NoteEvent[]
  originalNotes: NoteEvent[]
  matchedIndices: Set<number>
  playedNotes: PlayedNote[]
  matchResults: MatchResult[]
  measureStart: number
  measureEnd: number
  hand: Hand
  tempo: number
  startTime: number
  firstNoteOffset: number | null
}

/**
 * Serializable version of SessionState for Durable Object storage.
 * Used for HTTP-based session state persistence (legacy).
 */
export interface SerializedSessionState {
  sessionId: string
  pieceId: PieceId
  expectedNotes: NoteEvent[]
  originalNotes: NoteEvent[]
  matchedIndices: number[]
  playedNotes: PlayedNote[]
  matchResults: MatchResult[]
  measureStart: number
  measureEnd: number
  hand: Hand
  tempo: number
  startTime: number
  firstNoteOffset: number | null
}

export interface MatchResult {
  playedNote: PlayedNote
  expectedNote: NoteEvent | null
  result: "correct" | "wrong" | "extra"
  timingOffset: number
}

/**
 * Full session state persisted to DO storage for recovery after eviction.
 * Includes playedNotes and matchResults, unlike the basic wsSession storage.
 */
export interface PersistedSessionState {
  sessionId: string
  pieceId: PieceId
  expectedNotes: NoteEvent[]
  originalNotes: NoteEvent[]
  matchedIndices: number[] // Set<number> serialized as array
  playedNotes: PlayedNote[]
  matchResults: MatchResult[]
  measureStart: number
  measureEnd: number
  hand: Hand
  tempo: number
  startTime: number
  firstNoteOffset: number | null
  lastActivityTime: number
}

// Session timeout: 1 hour of inactivity
const SESSION_TIMEOUT_MS = 60 * 60 * 1000

/**
 * Durable Object for session management.
 *
 * Supports two modes:
 * 1. HTTP mode (legacy): State stored in DO storage, read/write per request
 * 2. WebSocket mode: State in memory during connection, much faster
 *
 * Session persistence:
 * - playedNotes and matchResults are persisted (debounced, max 1/sec)
 * - State restored on reconnect after DO eviction
 * - Session times out after 1 hour of inactivity
 */
export class SessionDO implements DurableObject {
  private state: DurableObjectState

  // WebSocket state
  private activeWebSocket: CFWebSocket | null = null
  private sessionState: SessionState | null = null
  private pingInterval: ReturnType<typeof setInterval> | null = null

  // Debounced persistence state
  private persistScheduled = false
  private lastPersistTime = 0

  constructor(state: DurableObjectState) {
    this.state = state
  }

  /**
   * Alarm handler for session timeout cleanup.
   * Called by CF Workers runtime when alarm fires.
   */
  async alarm(): Promise<void> {
    const persisted = await this.state.storage.get<PersistedSessionState>("persistedSession")
    if (!persisted) {
      // No session to clean up
      return
    }

    const now = Date.now()
    const timeSinceActivity = now - persisted.lastActivityTime

    if (timeSinceActivity >= SESSION_TIMEOUT_MS) {
      // Session timed out, clean up
      await this.state.storage.deleteAll()
      this.sessionState = null
    } else {
      // Not yet timed out, reschedule alarm for remaining time
      const nextAlarmTime = persisted.lastActivityTime + SESSION_TIMEOUT_MS
      await this.state.storage.setAlarm(nextAlarmTime)
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname

    try {
      // WebSocket upgrade for note stream
      if (path === "/ws" && request.headers.get("Upgrade") === "websocket") {
        return await this.handleWebSocket()
      }

      // HTTP endpoints for legacy state management
      if (request.method === "GET" && path === "/state") {
        const sessionState = await this.state.storage.get<SerializedSessionState>("session")
        return Response.json({ state: sessionState ?? null })
      }

      if (request.method === "PUT" && path === "/state") {
        const body = (await request.json()) as { state: SerializedSessionState }
        await this.state.storage.put("session", body.state)
        return Response.json({ ok: true })
      }

      if (request.method === "DELETE" && path === "/state") {
        await this.state.storage.delete("session")
        return Response.json({ ok: true })
      }

      // WebSocket-specific endpoints
      if (request.method === "POST" && path === "/ws/init") {
        // Initialize session state for WebSocket mode
        const body = (await request.json()) as {
          sessionId: string
          pieceId: PieceId
          expectedNotes: NoteEvent[]
          originalNotes: NoteEvent[]
          measureStart: number
          measureEnd: number
          hand: Hand
          tempo: number
        }

        this.sessionState = {
          sessionId: body.sessionId,
          pieceId: body.pieceId,
          expectedNotes: body.expectedNotes,
          originalNotes: body.originalNotes,
          matchedIndices: new Set(),
          playedNotes: [],
          matchResults: [],
          measureStart: body.measureStart,
          measureEnd: body.measureEnd,
          hand: body.hand,
          tempo: body.tempo,
          startTime: Date.now(),
          firstNoteOffset: null,
        }

        // Persist to storage for recovery in case DO is evicted
        await this.state.storage.put("wsSession", {
          sessionId: body.sessionId,
          pieceId: body.pieceId,
          expectedNotes: body.expectedNotes,
          originalNotes: body.originalNotes,
          measureStart: body.measureStart,
          measureEnd: body.measureEnd,
          hand: body.hand,
          tempo: body.tempo,
          startTime: this.sessionState.startTime,
        })

        return Response.json({ ok: true, sessionId: body.sessionId })
      }

      if (request.method === "POST" && path === "/ws/end") {
        // End WebSocket session and return results
        if (!this.sessionState) {
          return Response.json({ error: "No active session" }, { status: 400 })
        }

        const result = this.calculateFinalResult()

        // Send sessionEnd message before closing with Schema encoding
        if (this.activeWebSocket) {
          const endMsg = encodeSessionEndMessage(
            new WsSessionEndMessage({
              type: "sessionEnd",
              score: result.score,
            })
          )
          this.activeWebSocket.send(JSON.stringify(endMsg))
          this.activeWebSocket.close(1000, "Session ended")
        }

        this.cleanup()

        return Response.json(result)
      }

      if (request.method === "GET" && path === "/ws/state") {
        // Get current WebSocket session state
        if (!this.sessionState) {
          return Response.json({ active: false })
        }

        return Response.json({
          active: true,
          sessionId: this.sessionState.sessionId,
          pieceId: this.sessionState.pieceId,
          expectedNoteCount: this.sessionState.expectedNotes.length,
          playedNoteCount: this.sessionState.playedNotes.length,
          matchedCount: this.sessionState.matchedIndices.size,
          measureRange: [this.sessionState.measureStart, this.sessionState.measureEnd],
          hand: this.sessionState.hand,
          tempo: this.sessionState.tempo,
        })
      }

      return new Response("Not found", { status: 404 })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error"
      return Response.json({ error: message }, { status: 500 })
    }
  }

  private async handleWebSocket(): Promise<Response> {
    // Block if session already has active connection
    if (this.activeWebSocket) {
      return new Response("Session already has active connection", { status: 409 })
    }

    // Track whether this is a restore (reconnect) vs fresh connection
    let isRestore = false

    // Try to restore session state from storage if not in memory
    if (!this.sessionState) {
      // First try full persisted state (includes playedNotes, matchResults)
      const persisted = await this.state.storage.get<PersistedSessionState>("persistedSession")

      if (persisted) {
        this.sessionState = {
          sessionId: persisted.sessionId,
          pieceId: persisted.pieceId,
          expectedNotes: persisted.expectedNotes,
          originalNotes: persisted.originalNotes,
          matchedIndices: new Set(persisted.matchedIndices),
          playedNotes: persisted.playedNotes,
          matchResults: persisted.matchResults,
          measureStart: persisted.measureStart,
          measureEnd: persisted.measureEnd,
          hand: persisted.hand,
          tempo: persisted.tempo,
          startTime: persisted.startTime,
          firstNoteOffset: persisted.firstNoteOffset,
        }
        isRestore = true
      } else {
        // Fall back to basic wsSession storage (fresh session init)
        const stored = await this.state.storage.get<{
          sessionId: string
          pieceId: PieceId
          expectedNotes: NoteEvent[]
          originalNotes: NoteEvent[]
          measureStart: number
          measureEnd: number
          hand: Hand
          tempo: number
          startTime: number
        }>("wsSession")

        if (stored) {
          this.sessionState = {
            ...stored,
            matchedIndices: new Set(),
            playedNotes: [],
            matchResults: [],
            firstNoteOffset: null,
          }
          // Clean up wsSession storage after restoring
          await this.state.storage.delete("wsSession")
        }
      }
    }

    // Block if no session initialized
    if (!this.sessionState) {
      return new Response("Session not initialized. Call /ws/init first.", { status: 400 })
    }

    // Create WebSocket pair
    const pair = new WebSocketPair()
    const client = pair[0]
    const server = pair[1]

    server.accept()
    this.activeWebSocket = server

    // Send appropriate message based on whether this is a restore or fresh connection
    if (isRestore) {
      // Send restore message with current state info
      const restoreMsg = encodeRestoreMessage(
        new WsRestoreMessage({
          type: "restore",
          sessionId: this.sessionState.sessionId,
          playedNoteCount: this.sessionState.playedNotes.length,
          matchedCount: this.sessionState.matchedIndices.size,
        })
      )
      server.send(JSON.stringify(restoreMsg))
    } else {
      // Send ready message for fresh connection
      const readyMsg = encodeReadyMessage(
        new WsReadyMessage({
          type: "ready",
          sessionId: this.sessionState.sessionId,
        })
      )
      server.send(JSON.stringify(readyMsg))
    }

    // Start server-initiated heartbeat (every 30s)
    this.pingInterval = setInterval(() => {
      if (this.activeWebSocket?.readyState === 1) {
        // WebSocket.OPEN - Schema-encoded ping
        const pingMsg = encodePingMessage(new WsPingMessage({ type: "ping" }))
        this.activeWebSocket.send(JSON.stringify(pingMsg))
      }
    }, 30000)

    // Handle messages with Schema validation
    server.addEventListener("message", (event) => {
      try {
        const raw = JSON.parse(event.data as string) as unknown
        const data = decodeClientMessage(raw)

        if (data.type === "note") {
          const result = this.processNote(data)
          // Schema-encoded result message
          const resultMsg = encodeResultMessage(
            new WsResultMessage({
              type: "result",
              pitch: result.pitch,
              result: result.result,
              playedTime: result.playedTime,
              expectedNoteTime: result.expectedNoteTime,
              timingOffset: result.timingOffset,
            })
          )
          server.send(JSON.stringify(resultMsg))
        } else if (data.type === "pong") {
          // Heartbeat response - connection is alive
        }
      } catch (e) {
        console.error("Failed to process/validate WebSocket message:", e)
        // Log + ignore per spec
      }
    })

    server.addEventListener("close", () => {
      this.cleanupWebSocket()
    })

    server.addEventListener("error", () => {
      this.cleanupWebSocket()
    })

    // @ts-expect-error Cloudflare Response with webSocket property
    return new Response(null, { status: 101, webSocket: client })
  }

  private processNote(note: { pitch: number; velocity: number; timestamp: number; on: boolean }): {
    pitch: number
    result: "correct" | "wrong" | "extra"
    playedTime: number
    expectedNoteTime: number | null
    timingOffset: number
  } {
    if (!this.sessionState) {
      console.log("[DEBUG] processNote: no session state")
      return { pitch: note.pitch, result: "extra", playedTime: note.timestamp, expectedNoteTime: null, timingOffset: 0 }
    }

    // Only process note-on events
    if (!note.on) {
      console.log(`[DEBUG] processNote: note-off ignored pitch=${note.pitch}`)
      return { pitch: note.pitch, result: "extra", playedTime: note.timestamp, expectedNoteTime: null, timingOffset: 0 }
    }

    // Calculate timing offset on first note
    let firstNoteOffset = this.sessionState.firstNoteOffset
    if (firstNoteOffset === null && this.sessionState.expectedNotes.length > 0) {
      firstNoteOffset = note.timestamp
      this.sessionState.firstNoteOffset = firstNoteOffset
      console.log(`[DEBUG] processNote: first note, offset=${firstNoteOffset}`)
    }

    // Adjust timestamp by the offset
    const adjustedTimestamp = note.timestamp - (firstNoteOffset ?? 0)
    console.log(`[DEBUG] processNote: pitch=${note.pitch} raw=${note.timestamp} adjusted=${adjustedTimestamp}`)

    const playedNote = {
      pitch: note.pitch as MidiPitch,
      timestamp: adjustedTimestamp as Milliseconds,
      velocity: note.velocity as Velocity,
      duration: Option.none<Milliseconds>(),
    } as PlayedNote

    // Match this note against expected notes
    const result = this.matchNotePure(
      playedNote,
      this.sessionState.expectedNotes,
      this.sessionState.matchedIndices,
      this.sessionState.hand
    )

    // Update state
    this.sessionState.playedNotes.push(playedNote)
    this.sessionState.matchResults.push(result)

    // Persist state (debounced, max 1/sec)
    this.schedulePersist()

    // Find original note time for UI mapping
    let originalNoteTime: number | null = null
    if (result.expectedNote) {
      const matchedIndex = this.sessionState.expectedNotes.findIndex((n) => n === result.expectedNote)
      if (matchedIndex >= 0 && matchedIndex < this.sessionState.originalNotes.length) {
        originalNoteTime = this.sessionState.originalNotes[matchedIndex]!.startTime
      }
    }

    return {
      pitch: note.pitch,
      result: result.result,
      playedTime: adjustedTimestamp,
      expectedNoteTime: originalNoteTime,
      timingOffset: result.timingOffset,
    }
  }

  private matchNotePure(
    playedNote: PlayedNote,
    expectedNotes: NoteEvent[],
    matchedIndices: Set<number>,
    hand: Hand
  ): MatchResult {
    // Use shared note matching logic (orders by timing distance, closest first)
    const result = sharedMatchNote(playedNote, expectedNotes, matchedIndices, hand, DEFAULT_CONFIG)
    return {
      playedNote: result.playedNote as PlayedNote,
      expectedNote: result.expectedNote,
      result: result.result,
      timingOffset: result.timingOffset,
    }
  }

  private calculateFinalResult(): {
    score: {
      correct: number
      early: number
      late: number
      extra: number
      missed: number
      accuracy: number
    }
    matchResults: MatchResult[]
    missedNotes: NoteEvent[]
  } {
    if (!this.sessionState) {
      return {
        score: { correct: 0, early: 0, late: 0, extra: 0, missed: 0, accuracy: 0 },
        matchResults: [],
        missedNotes: [],
      }
    }

    const { matchResults, expectedNotes, matchedIndices, hand } = this.sessionState

    const filteredExpected = hand === "both" ? expectedNotes : expectedNotes.filter((n) => n.hand === hand)

    const correct = matchResults.filter((r) => r.result === "correct").length
    const extra = matchResults.filter((r) => r.result === "extra").length

    // Early/late breakdown (for correct notes)
    const correctResults = matchResults.filter((r) => r.result === "correct")
    const early = correctResults.filter((r) => r.timingOffset < -50).length
    const late = correctResults.filter((r) => r.timingOffset > 50).length

    // Missed notes
    const missedNotes = filteredExpected.filter((_n, idx) => {
      const originalIndex = expectedNotes.findIndex((en) => en === filteredExpected[idx])
      return !matchedIndices.has(originalIndex)
    })

    const totalExpected = filteredExpected.length
    const accuracy = totalExpected > 0 ? correct / totalExpected : 0

    return {
      score: {
        correct,
        early,
        late,
        extra,
        missed: missedNotes.length,
        accuracy,
      },
      matchResults,
      missedNotes,
    }
  }

  /** Clean up WebSocket resources but preserve session state for /ws/end */
  private cleanupWebSocket(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval)
      this.pingInterval = null
    }
    this.activeWebSocket = null
    // Session state preserved - will be cleared by /ws/end or timeout
  }

  /** Full cleanup including session state and storage */
  private async cleanup(): Promise<void> {
    this.cleanupWebSocket()
    this.sessionState = null
    // Clear all persisted state
    await this.state.storage.deleteAll()
  }

  /**
   * Schedule a debounced persist. Ensures at most one persist per second.
   */
  private schedulePersist(): void {
    if (this.persistScheduled) {
      return // Already scheduled
    }

    const now = Date.now()
    const timeSinceLastPersist = now - this.lastPersistTime
    const minInterval = 1000 // 1 second

    if (timeSinceLastPersist >= minInterval) {
      // Can persist immediately
      void this.persistState()
    } else {
      // Schedule for later
      this.persistScheduled = true
      const delay = minInterval - timeSinceLastPersist
      setTimeout(() => {
        this.persistScheduled = false
        void this.persistState()
      }, delay)
    }
  }

  /**
   * Persist current session state to DO storage.
   * Called with debouncing to avoid excessive writes.
   */
  private async persistState(): Promise<void> {
    if (!this.sessionState) {
      return
    }

    const now = Date.now()
    this.lastPersistTime = now

    const persisted: PersistedSessionState = {
      sessionId: this.sessionState.sessionId,
      pieceId: this.sessionState.pieceId,
      expectedNotes: this.sessionState.expectedNotes,
      originalNotes: this.sessionState.originalNotes,
      matchedIndices: Array.from(this.sessionState.matchedIndices),
      playedNotes: this.sessionState.playedNotes,
      matchResults: this.sessionState.matchResults,
      measureStart: this.sessionState.measureStart,
      measureEnd: this.sessionState.measureEnd,
      hand: this.sessionState.hand,
      tempo: this.sessionState.tempo,
      startTime: this.sessionState.startTime,
      firstNoteOffset: this.sessionState.firstNoteOffset,
      lastActivityTime: now,
    }

    await this.state.storage.put("persistedSession", persisted)

    // Set/reset alarm for session timeout
    await this.state.storage.setAlarm(now + SESSION_TIMEOUT_MS)
  }
}

// Type declarations for DO bindings
export interface SessionDONamespace {
  get(id: DurableObjectId): DurableObjectStub
  idFromName(name: string): DurableObjectId
}

export interface DurableObject {
  fetch(request: Request): Promise<Response>
}

export interface DurableObjectId {
  toString(): string
}

export interface DurableObjectStub {
  fetch(input: RequestInfo, init?: RequestInit): Promise<Response>
}
