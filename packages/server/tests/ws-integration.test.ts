/**
 * WebSocket Integration Tests
 *
 * These tests verify the WebSocket note stream functionality against a real
 * Miniflare instance with Durable Objects. They test the full flow:
 * - HTTP session start
 * - WebSocket upgrade and note streaming
 * - HTTP session end with persistence
 *
 * Run with: bun test packages/server/tests/ws-integration.test.ts
 *
 * NOTE: These tests require `bun run test:ws:setup` to be running in another terminal.
 * This starts a local Miniflare instance that the tests connect to.
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

// Worker URL - assumes wrangler dev is running on default port
const WORKER_URL = process.env.WORKER_URL ?? "http://localhost:8787"
const WS_URL = WORKER_URL.replace("http", "ws")

// Helper to check if worker is running (used before tests)
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

// Helper to start a session via HTTP (WebSocket mode)
// This uses the new WebSocket-specific init endpoint
async function startSession(
  pieceId: string,
  notes: typeof TEST_PIECE_NOTES = TEST_PIECE_NOTES
): Promise<{ sessionId: string; wsUrl: string }> {
  const sessionId = crypto.randomUUID()

  // Convert test notes to NoteEvent format
  const expectedNotes = notes.map((n) => ({
    pitch: n.pitch,
    startTime: n.startTime,
    duration: n.duration,
    measure: n.measure,
    hand: n.hand,
    voice: n.voice,
  }))

  // Initialize session state in DO
  const response = await fetch(`${WORKER_URL}/api/session/ws/${sessionId}/init`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId,
      pieceId,
      expectedNotes,
      originalNotes: expectedNotes, // Same for testing
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

// Helper to end a session via HTTP (WebSocket mode)
async function endSession(sessionId: string): Promise<{
  score: { correct: number; accuracy: number; missed: number }
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

  return (await response.json()) as { score: { correct: number; accuracy: number; missed: number }; missedNotes: unknown[] }
}

// Helper to connect WebSocket and wait for ready
function connectWebSocket(wsUrl: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl)

    const timeout = setTimeout(() => {
      ws.close()
      reject(new Error("WebSocket connection timeout"))
    }, 5000)

    ws.onopen = () => {
      // Wait for ready message
    }

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data as string) as WsServerMessage
      if (msg.type === "ready") {
        clearTimeout(timeout)
        resolve(ws)
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

// Helper to send note and wait for result
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

// No need for createTestPiece - we pass notes directly to DO init

// Check if worker is running before tests
let workerAvailable = false

describe("WebSocket Integration", () => {
  beforeAll(async () => {
    // Check if worker is running
    workerAvailable = await isWorkerRunning()
    if (!workerAvailable) {
      console.log(`
[ws-integration] Worker not running at ${WORKER_URL}
To run these tests: bun run test:ws:worker (in one terminal), bun run test:ws (in another)
Skipping WebSocket integration tests.
`)
    } else {
      console.log(`Worker available at ${WORKER_URL}`)
    }
  })

  describe("HTTP baseline (sanity check)", () => {
    it("health check returns ok", async () => {
      if (!workerAvailable) return // skip
      const response = await fetch(`${WORKER_URL}/health`)
      expect(response.status).toBe(200)
      expect(await response.text()).toBe("ok")
    })

    it("session state returns inactive when no session", async () => {
      if (!workerAvailable) return // skip
      const response = await fetch(`${WORKER_URL}/api/session/state`)
      expect(response.status).toBe(200)
      const data = (await response.json()) as { active: boolean }
      expect(data.active).toBe(false)
    })
  })

  describe("WebSocket connection lifecycle", () => {
    it("connects and receives ready message", async () => {
      if (!workerAvailable) return
      const { sessionId, wsUrl } = await startSession("test-piece")

      const ws = await connectWebSocket(wsUrl)
      expect(ws.readyState).toBe(WebSocket.OPEN)
      ws.close()

      // Cleanup
      await endSession(sessionId).catch(() => {})
    })

    it("rejects second connection to same session", async () => {
      if (!workerAvailable) return
      const { sessionId, wsUrl } = await startSession("test-piece")

      // First connection
      const ws1 = await connectWebSocket(wsUrl)

      // Second connection should be rejected
      await expect(connectWebSocket(wsUrl)).rejects.toThrow()

      ws1.close()
      await endSession(sessionId).catch(() => {})
    })
  })

  describe("Note streaming", () => {
    it("receives correct result for correct note", async () => {
      if (!workerAvailable) return
      const { sessionId, wsUrl } = await startSession("test-piece")
      const ws = await connectWebSocket(wsUrl)

      // Send first note (C4 = pitch 60)
      const result = await sendNote(ws, 60, 0)

      expect(result.type).toBe("result")
      if (result.type === "result") {
        expect(result.pitch).toBe(60)
        expect(result.result).toBe("correct")
      }

      ws.close()
      await endSession(sessionId).catch(() => {})
    })

    it("receives wrong result for incorrect note", async () => {
      if (!workerAvailable) return
      const { sessionId, wsUrl } = await startSession("test-piece")
      const ws = await connectWebSocket(wsUrl)

      // Send wrong note (A4 = pitch 69 instead of C4 = 60)
      const result = await sendNote(ws, 69, 0)

      expect(result.type).toBe("result")
      if (result.type === "result") {
        expect(result.pitch).toBe(69)
        expect(result.result).toBe("wrong")
      }

      ws.close()
      await endSession(sessionId).catch(() => {})
    })

    it("streams multiple notes correctly", async () => {
      if (!workerAvailable) return
      const { sessionId, wsUrl } = await startSession("test-piece")
      const ws = await connectWebSocket(wsUrl)

      // Play all 4 correct notes
      const results: WsServerMessage[] = []
      for (const note of [60, 62, 64, 65]) {
        const result = await sendNote(ws, note, (note - 60) * 250)
        results.push(result)
      }

      // All should be correct
      for (const result of results) {
        expect(result.type).toBe("result")
        if (result.type === "result") {
          expect(result.result).toBe("correct")
        }
      }

      ws.close()
      await endSession(sessionId).catch(() => {})
    })
  })

  describe("Session end via HTTP", () => {
    it("returns scores on session end", async () => {
      if (!workerAvailable) return
      const { sessionId, wsUrl } = await startSession("test-piece")
      const ws = await connectWebSocket(wsUrl)

      // Play all notes
      for (const note of [60, 62, 64, 65]) {
        await sendNote(ws, note, (note - 60) * 250)
      }

      // End session via HTTP
      const endResult = await endSession(sessionId)

      expect(endResult.score.correct).toBe(4)
      expect(endResult.score.accuracy).toBe(1) // 100%
      expect(endResult.missedNotes).toHaveLength(0)

      ws.close()
    })

    it("sends sessionEnd message before closing", async () => {
      if (!workerAvailable) return
      const { sessionId, wsUrl } = await startSession("test-piece")
      const ws = await connectWebSocket(wsUrl)

      // Collect all messages
      const messages: WsServerMessage[] = []
      const originalOnMessage = ws.onmessage
      ws.onmessage = (event) => {
        messages.push(JSON.parse(event.data as string))
        if (originalOnMessage) originalOnMessage.call(ws, event)
      }

      // Play notes
      for (const note of [60, 62, 64, 65]) {
        await sendNote(ws, note, (note - 60) * 250)
      }

      // End session - should trigger sessionEnd message
      await endSession(sessionId)

      // Wait a bit for the message
      await new Promise((r) => setTimeout(r, 100))

      // Should have received sessionEnd
      const sessionEnd = messages.find((m) => m.type === "sessionEnd")
      expect(sessionEnd).toBeDefined()
      if (sessionEnd?.type === "sessionEnd") {
        expect(sessionEnd.score.correct).toBe(4)
        expect(sessionEnd.score.accuracy).toBe(1)
      }
    })
  })

  describe("Heartbeat", () => {
    it("accepts pong messages", async () => {
      if (!workerAvailable) return
      const { sessionId, wsUrl } = await startSession("test-piece")
      const ws = await connectWebSocket(wsUrl)

      // Client sends pong (normally in response to server ping)
      const pongMsg: WsClientMessage = { type: "pong" }
      ws.send(JSON.stringify(pongMsg))

      // Wait and verify connection still alive
      await new Promise((r) => setTimeout(r, 100))
      expect(ws.readyState).toBe(WebSocket.OPEN)

      ws.close()
      await endSession(sessionId).catch(() => {})
    })
  })
})
