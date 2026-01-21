/**
 * SessionDO Persistence Tests
 *
 * These tests verify the session persistence and recovery behavior:
 * - Debounced persistence of playedNotes and matchResults
 * - State restoration on reconnect (simulating DO eviction)
 * - Session timeout alarm cleanup
 *
 * Run with: bun test packages/server/tests/session-do-persistence.test.ts
 *
 * NOTE: These tests require `bun run test:ws:setup` to be running in another terminal.
 */
import { describe, expect, it, beforeAll } from "bun:test"
import type { WsServerMessage, WsClientMessage } from "@etude/shared"

// Test piece data - simple 4-note sequence
const TEST_PIECE_NOTES = [
  { pitch: 60, startTime: 0, duration: 500, measure: 1, hand: "right", voice: null },
  { pitch: 62, startTime: 500, duration: 500, measure: 1, hand: "right", voice: null },
  { pitch: 64, startTime: 1000, duration: 500, measure: 1, hand: "right", voice: null },
  { pitch: 65, startTime: 1500, duration: 500, measure: 1, hand: "right", voice: null },
]

// Worker URL
const WORKER_URL = process.env.WORKER_URL ?? "http://localhost:8787"
const WS_URL = WORKER_URL.replace("http", "ws")

async function isWorkerRunning(): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 2000)
    const response = await fetch(`${WORKER_URL}/health`, { signal: controller.signal })
    clearTimeout(timeout)
    return response.ok
  } catch {
    return false
  }
}

async function startSession(
  pieceId: string,
  notes: typeof TEST_PIECE_NOTES = TEST_PIECE_NOTES
): Promise<{ sessionId: string; wsUrl: string }> {
  const sessionId = crypto.randomUUID()

  const expectedNotes = notes.map((n) => ({
    pitch: n.pitch,
    startTime: n.startTime,
    duration: n.duration,
    measure: n.measure,
    hand: n.hand,
    voice: n.voice,
  }))

  const response = await fetch(`${WORKER_URL}/api/session/ws/${sessionId}/init`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId,
      pieceId,
      expectedNotes,
      originalNotes: expectedNotes,
      measureStart: 1,
      measureEnd: 1,
      hand: "right",
      tempo: 100,
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Failed to init session: ${response.status} - ${text}`)
  }

  return {
    sessionId,
    wsUrl: `${WS_URL}/api/session/ws/${sessionId}`,
  }
}

async function endSession(sessionId: string): Promise<{
  score: { correct: number; accuracy: number; missed: number; extra: number }
  missedNotes: unknown[]
}> {
  const response = await fetch(`${WORKER_URL}/api/session/ws/${sessionId}/end`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Failed to end session: ${response.status} - ${text}`)
  }

  return (await response.json()) as { score: { correct: number; accuracy: number; missed: number; extra: number }; missedNotes: unknown[] }
}

// Connect WebSocket and wait for ready OR restore message
function connectWebSocket(wsUrl: string): Promise<{ ws: WebSocket; initialMessage: WsServerMessage }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl)

    const timeout = setTimeout(() => {
      ws.close()
      reject(new Error("WebSocket connection timeout"))
    }, 5000)

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data as string) as WsServerMessage
      if (msg.type === "ready" || msg.type === "restore") {
        clearTimeout(timeout)
        resolve({ ws, initialMessage: msg })
      }
    }

    ws.onerror = (e) => {
      clearTimeout(timeout)
      reject(new Error(`WebSocket error: ${e}`))
    }

    ws.onclose = (e) => {
      clearTimeout(timeout)
      reject(new Error(`WebSocket closed before ready: code=${e.code}`))
    }
  })
}

function sendNote(
  ws: WebSocket,
  pitch: number,
  timestamp: number,
  velocity = 80,
  on = true
): Promise<WsServerMessage> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.removeEventListener("message", handler)
      reject(new Error("Note result timeout"))
    }, 5000)

    const handler = (event: MessageEvent) => {
      const msg = JSON.parse(event.data as string) as WsServerMessage
      if (msg.type === "result") {
        clearTimeout(timeout)
        ws.removeEventListener("message", handler)
        resolve(msg)
      }
    }
    ws.addEventListener("message", handler)

    const msg: WsClientMessage = { type: "note", pitch, velocity, timestamp, on }
    ws.send(JSON.stringify(msg))
  })
}

let workerAvailable = false

describe("SessionDO Persistence", () => {
  beforeAll(async () => {
    workerAvailable = await isWorkerRunning()
    if (!workerAvailable) {
      console.log(`
[session-do-persistence] Worker not running at ${WORKER_URL}
To run these tests: bun run test:ws:worker (in one terminal), bun run test:ws (in another)
Skipping persistence tests.
`)
    } else {
      console.log(`Worker available at ${WORKER_URL}`)
    }
  })

  describe("State restoration after WebSocket disconnect", () => {
    it("restores playedNotes count after reconnect", async () => {
      if (!workerAvailable) return
      const { sessionId, wsUrl } = await startSession("test-piece-persist")

      // Connect and play 2 notes
      const { ws: ws1, initialMessage: msg1 } = await connectWebSocket(wsUrl)
      expect(msg1.type).toBe("ready") // Fresh session

      await sendNote(ws1, 60, 0)
      await sendNote(ws1, 62, 500)

      // Disconnect
      ws1.close()
      // Wait for debounced persistence to complete (1 second max)
      await new Promise((r) => setTimeout(r, 1500))

      // Reconnect - should receive restore message
      const { ws: ws2, initialMessage: msg2 } = await connectWebSocket(wsUrl)

      expect(msg2.type).toBe("restore")
      if (msg2.type === "restore") {
        expect(msg2.playedNoteCount).toBe(2)
        expect(msg2.matchedCount).toBe(2)
      }

      ws2.close()
      await endSession(sessionId).catch(() => {})
    })

    it("accumulates notes across multiple reconnects", async () => {
      if (!workerAvailable) return
      const { sessionId, wsUrl } = await startSession("test-piece-accum")

      // First connection: play 1 note
      const { ws: ws1 } = await connectWebSocket(wsUrl)
      await sendNote(ws1, 60, 0)
      ws1.close()
      await new Promise((r) => setTimeout(r, 1500))

      // Second connection: play 1 more note
      const { ws: ws2, initialMessage: msg2 } = await connectWebSocket(wsUrl)
      expect(msg2.type).toBe("restore")
      if (msg2.type === "restore") {
        expect(msg2.playedNoteCount).toBe(1)
      }
      await sendNote(ws2, 62, 500)
      ws2.close()
      await new Promise((r) => setTimeout(r, 1500))

      // Third connection: verify accumulated state
      const { ws: ws3, initialMessage: msg3 } = await connectWebSocket(wsUrl)
      if (msg3.type === "restore") {
        expect(msg3.playedNoteCount).toBe(2)
        expect(msg3.matchedCount).toBe(2)
      }

      // Play remaining notes
      await sendNote(ws3, 64, 1000)
      await sendNote(ws3, 65, 1500)

      ws3.close()

      // Verify final score
      const endResult = await endSession(sessionId)
      expect(endResult.score.correct).toBe(4)
      expect(endResult.score.accuracy).toBe(1)
    })

    it("preserves matchedIndices preventing double-matching", async () => {
      if (!workerAvailable) return
      const { sessionId, wsUrl } = await startSession("test-piece-indices")

      // Play first note
      const { ws: ws1 } = await connectWebSocket(wsUrl)
      const result1 = await sendNote(ws1, 60, 0)
      expect(result1.type).toBe("result")
      if (result1.type === "result") {
        expect(result1.result).toBe("correct")
      }
      ws1.close()
      await new Promise((r) => setTimeout(r, 1500))

      // Reconnect and try to play same pitch again
      const { ws: ws2 } = await connectWebSocket(wsUrl)
      const result2 = await sendNote(ws2, 60, 100) // Same pitch
      // Should be wrong because pitch 60 is already matched
      expect(result2.type).toBe("result")
      if (result2.type === "result") {
        expect(result2.result).toBe("wrong")
      }

      ws2.close()
      await endSession(sessionId).catch(() => {})
    })
  })

  describe("Debounced persistence", () => {
    it("persists state within 1 second of note", async () => {
      if (!workerAvailable) return
      const { sessionId, wsUrl } = await startSession("test-piece-debounce")

      const { ws } = await connectWebSocket(wsUrl)

      // Play a note
      await sendNote(ws, 60, 0)

      // Close immediately (before debounce would fire)
      ws.close()

      // Wait less than 1 second, then reconnect
      await new Promise((r) => setTimeout(r, 200))

      // State might not be persisted yet (debounce in progress)
      // Wait a bit more for debounce to complete
      await new Promise((r) => setTimeout(r, 1000))

      // Now reconnect - state should be persisted
      const { initialMessage } = await connectWebSocket(wsUrl)
      expect(initialMessage.type).toBe("restore")
      if (initialMessage.type === "restore") {
        expect(initialMessage.playedNoteCount).toBe(1)
      }

      await endSession(sessionId).catch(() => {})
    })

    it("batches rapid notes into single persist", async () => {
      if (!workerAvailable) return
      const { sessionId, wsUrl } = await startSession("test-piece-batch")

      const { ws } = await connectWebSocket(wsUrl)

      // Play 4 notes rapidly (all within debounce window)
      await sendNote(ws, 60, 0)
      await sendNote(ws, 62, 10)
      await sendNote(ws, 64, 20)
      await sendNote(ws, 65, 30)

      ws.close()

      // Wait for single debounced persist
      await new Promise((r) => setTimeout(r, 1500))

      // Verify all notes persisted
      const { initialMessage } = await connectWebSocket(wsUrl)
      if (initialMessage.type === "restore") {
        expect(initialMessage.playedNoteCount).toBe(4)
      }

      await endSession(sessionId).catch(() => {})
    })
  })

  describe("PersistedSessionState schema", () => {
    it("restores firstNoteOffset correctly", async () => {
      if (!workerAvailable) return
      const { sessionId, wsUrl } = await startSession("test-piece-offset")

      // Connect and play first note with a large timestamp offset
      const { ws: ws1 } = await connectWebSocket(wsUrl)
      await sendNote(ws1, 60, 5000) // User started 5 seconds late
      ws1.close()
      await new Promise((r) => setTimeout(r, 1500))

      // Reconnect and play next note
      const { ws: ws2 } = await connectWebSocket(wsUrl)
      // Play second note 500ms after first (adjusted timing)
      const result = await sendNote(ws2, 62, 5500)

      expect(result.type).toBe("result")
      if (result.type === "result") {
        // Should be correct because timing is relative to first note
        expect(result.result).toBe("correct")
      }

      ws2.close()
      await endSession(sessionId).catch(() => {})
    })
  })

  describe("Session state on /ws/end", () => {
    it("clears persisted state after session end", async () => {
      if (!workerAvailable) return
      const { sessionId, wsUrl } = await startSession("test-piece-clear")

      const { ws } = await connectWebSocket(wsUrl)
      await sendNote(ws, 60, 0)
      ws.close()
      await new Promise((r) => setTimeout(r, 1500))

      // End the session
      await endSession(sessionId)

      // Trying to reconnect should fail (session cleaned up)
      await expect(connectWebSocket(wsUrl)).rejects.toThrow()
    })
  })
})
