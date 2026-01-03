import type { DurableObjectState, WebSocket as CFWebSocket } from "@cloudflare/workers-types"
import type { NoteEvent, PlayedNote, PieceId, Hand, WsClientMessage, WsServerMessage } from "@etude/shared"
import { Milliseconds, MidiPitch, Velocity } from "@etude/shared"
import { Option } from "effect"

// WebSocketPair is a global in Cloudflare Workers runtime
declare const WebSocketPair: {
  new (): { 0: CFWebSocket; 1: CFWebSocket }
}

// Configuration constants (duplicated from comparison.ts to avoid Effect dependency in DO)
const TIMING_TOLERANCE_MS = 150

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
 * Durable Object for session management.
 *
 * Supports two modes:
 * 1. HTTP mode (legacy): State stored in DO storage, read/write per request
 * 2. WebSocket mode: State in memory during connection, much faster
 */
export class SessionDO implements DurableObject {
  private state: DurableObjectState

  // WebSocket state
  private activeWebSocket: CFWebSocket | null = null
  private sessionState: SessionState | null = null
  private pingInterval: ReturnType<typeof setInterval> | null = null

  constructor(state: DurableObjectState) {
    this.state = state
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname

    try {
      // WebSocket upgrade for note stream
      if (path === "/ws" && request.headers.get("Upgrade") === "websocket") {
        return this.handleWebSocket()
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

        return Response.json({ ok: true, sessionId: body.sessionId })
      }

      if (request.method === "POST" && path === "/ws/end") {
        // End WebSocket session and return results
        if (!this.sessionState) {
          return Response.json({ error: "No active session" }, { status: 400 })
        }

        const result = this.calculateFinalResult()

        // Send sessionEnd message before closing
        if (this.activeWebSocket) {
          const endMsg: WsServerMessage = {
            type: "sessionEnd",
            score: result.score,
          }
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

  private handleWebSocket(): Response {
    // Block if session already has active connection
    if (this.activeWebSocket) {
      return new Response("Session already has active connection", { status: 409 })
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

    // Send ready message
    const readyMsg: WsServerMessage = {
      type: "ready",
      sessionId: this.sessionState.sessionId,
    }
    server.send(JSON.stringify(readyMsg))

    // Start server-initiated heartbeat (every 30s)
    this.pingInterval = setInterval(() => {
      if (this.activeWebSocket?.readyState === 1) {
        // WebSocket.OPEN
        const pingMsg: WsServerMessage = { type: "ping" }
        this.activeWebSocket.send(JSON.stringify(pingMsg))
      }
    }, 30000)

    // Handle messages
    server.addEventListener("message", (event) => {
      try {
        const data = JSON.parse(event.data as string) as WsClientMessage

        if (data.type === "note") {
          const result = this.processNote(data)
          const resultMsg: WsServerMessage = {
            type: "result",
            pitch: result.pitch,
            result: result.result,
            timingOffset: result.timingOffset,
            expectedNoteTime: result.expectedNoteTime,
          }
          server.send(JSON.stringify(resultMsg))
        } else if (data.type === "pong") {
          // Heartbeat response - connection is alive
        }
      } catch (e) {
        console.error("Failed to process WebSocket message:", e)
        // Log + ignore per spec
      }
    })

    server.addEventListener("close", () => {
      this.cleanup()
    })

    server.addEventListener("error", () => {
      this.cleanup()
    })

    // @ts-expect-error Cloudflare Response with webSocket property
    return new Response(null, { status: 101, webSocket: client })
  }

  private processNote(note: { pitch: number; velocity: number; timestamp: number; on: boolean }): {
    pitch: number
    result: "correct" | "wrong" | "extra"
    timingOffset: number
    expectedNoteTime: number | null
  } {
    if (!this.sessionState) {
      return { pitch: note.pitch, result: "extra", timingOffset: 0, expectedNoteTime: null }
    }

    // Only process note-on events
    if (!note.on) {
      return { pitch: note.pitch, result: "extra", timingOffset: 0, expectedNoteTime: null }
    }

    // Calculate timing offset on first note
    let firstNoteOffset = this.sessionState.firstNoteOffset
    if (firstNoteOffset === null && this.sessionState.expectedNotes.length > 0) {
      firstNoteOffset = note.timestamp
      this.sessionState.firstNoteOffset = firstNoteOffset
    }

    // Adjust timestamp by the offset
    const adjustedTimestamp = note.timestamp - (firstNoteOffset ?? 0)

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
      timingOffset: result.timingOffset,
      expectedNoteTime: originalNoteTime,
    }
  }

  private matchNotePure(
    playedNote: PlayedNote,
    expectedNotes: NoteEvent[],
    matchedIndices: Set<number>,
    hand: Hand
  ): MatchResult {
    // Filter expected notes by hand and unmatched
    const eligibleNotes = expectedNotes
      .map((note, index) => ({ note, index }))
      .filter(({ note, index }) => {
        if (matchedIndices.has(index)) return false
        if (hand !== "both" && note.hand !== hand) return false
        return true
      })

    if (eligibleNotes.length === 0) {
      return {
        playedNote,
        expectedNote: null,
        result: "extra",
        timingOffset: 0,
      }
    }

    // Find closest unmatched note with same pitch
    let bestMatch: { note: NoteEvent; index: number } | null = null
    let bestDistance = Infinity

    for (const { note, index } of eligibleNotes) {
      if (note.pitch === playedNote.pitch) {
        const distance = Math.abs(playedNote.timestamp - note.startTime)
        if (distance < bestDistance) {
          bestDistance = distance
          bestMatch = { note, index }
        }
      }
    }

    if (bestMatch) {
      const timingOffset = playedNote.timestamp - bestMatch.note.startTime
      matchedIndices.add(bestMatch.index)

      const absOffset = Math.abs(timingOffset)
      const isCorrect = absOffset <= TIMING_TOLERANCE_MS * 2

      return {
        playedNote,
        expectedNote: bestMatch.note,
        result: isCorrect ? "correct" : "wrong",
        timingOffset,
      }
    }

    // No matching pitch - find closest by time for offset
    let closestByTime: { note: NoteEvent; index: number } | null = null
    let closestTimeDistance = Infinity

    for (const { note, index } of eligibleNotes) {
      const distance = Math.abs(playedNote.timestamp - note.startTime)
      if (distance < closestTimeDistance) {
        closestTimeDistance = distance
        closestByTime = { note, index }
      }
    }

    if (closestByTime) {
      const timingOffset = playedNote.timestamp - closestByTime.note.startTime
      return {
        playedNote,
        expectedNote: closestByTime.note,
        result: "wrong",
        timingOffset,
      }
    }

    return {
      playedNote,
      expectedNote: null,
      result: "extra",
      timingOffset: 0,
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

  private cleanup(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval)
      this.pingInterval = null
    }
    this.activeWebSocket = null
    this.sessionState = null // Discard session on disconnect per spec
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
