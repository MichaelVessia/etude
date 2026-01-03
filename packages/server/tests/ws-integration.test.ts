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

  describe("Full session flow (client flow)", () => {
    // Helper to import a piece via /api/piece/import
    async function importPiece(id: string, xml: string, filePath: string): Promise<{
      id: string
      name: string
      totalMeasures: number
      noteCount?: number
      alreadyExists?: boolean
    }> {
      const response = await fetch(`${WORKER_URL}/api/piece/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, xml, filePath }),
      })
      if (!response.ok) {
        const text = await response.text()
        throw new Error(`Failed to import piece: ${response.status} - ${text}`)
      }
      return response.json() as Promise<{
        id: string
        name: string
        totalMeasures: number
        noteCount?: number
        alreadyExists?: boolean
      }>
    }

    // Helper to start session using /api/session/ws/start (the client flow)
    async function startSessionWithPiece(params: {
      pieceId: string
      measureStart: number
      measureEnd: number
      hand: "left" | "right" | "both"
      tempo: number
    }): Promise<{
      sessionId: string
      wsUrl: string
      expectedNoteCount: number
      measureRange: [number, number]
    }> {
      const response = await fetch(`${WORKER_URL}/api/session/ws/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      })
      if (!response.ok) {
        const text = await response.text()
        throw new Error(`Failed to start session: ${response.status} - ${text}`)
      }
      return response.json() as Promise<{
        sessionId: string
        wsUrl: string
        expectedNoteCount: number
        measureRange: [number, number]
      }>
    }

    // Simple MusicXML for testing
    const SIMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
  <work><work-title>Test Piece</work-title></work>
  <identification><creator type="composer">Test</creator></identification>
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>1</duration><type>quarter</type><staff>1</staff><voice>1</voice>
      </note>
      <note>
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>1</duration><type>quarter</type><staff>1</staff><voice>1</voice>
      </note>
      <note>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>1</duration><type>quarter</type><staff>1</staff><voice>1</voice>
      </note>
      <note>
        <pitch><step>F</step><octave>4</octave></pitch>
        <duration>1</duration><type>quarter</type><staff>1</staff><voice>1</voice>
      </note>
    </measure>
  </part>
</score-partwise>`

    it("imports piece and starts session with correct note count", async () => {
      if (!workerAvailable) return
      const pieceId = `test-piece-${Date.now()}`

      // Import piece
      const importResult = await importPiece(pieceId, SIMPLE_XML, `/test/${pieceId}.xml`)
      expect(importResult.id).toBe(pieceId)
      expect(importResult.noteCount).toBe(4)

      // Start session
      const sessionResult = await startSessionWithPiece({
        pieceId,
        measureStart: 1,
        measureEnd: 1,
        hand: "both",
        tempo: 100,
      })

      expect(sessionResult.sessionId).toBeDefined()
      expect(sessionResult.wsUrl).toContain(sessionResult.sessionId)
      expect(sessionResult.expectedNoteCount).toBe(4)
      expect(sessionResult.measureRange).toEqual([1, 1])

      // Connect and play
      const ws = await connectWebSocket(sessionResult.wsUrl)

      // Play C4, D4, E4, F4 (MIDI 60, 62, 64, 65)
      // At 120 BPM, quarter notes are 500ms apart: 0, 500, 1000, 1500
      const results: WsServerMessage[] = []
      const expectedTimestamps = [0, 500, 1000, 1500]
      for (let i = 0; i < 4; i++) {
        const result = await sendNote(ws, [60, 62, 64, 65][i]!, expectedTimestamps[i]!)
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
      await endSession(sessionResult.sessionId).catch(() => {})
    })

    it("returns 404 when piece not found", async () => {
      if (!workerAvailable) return

      const response = await fetch(`${WORKER_URL}/api/session/ws/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pieceId: "non-existent-piece",
          measureStart: 1,
          measureEnd: 1,
          hand: "both",
          tempo: 100,
        }),
      })

      expect(response.status).toBe(404)
      const data = await response.json() as { error: string }
      expect(data.error).toContain("not found")
    })

    it("filters notes by measure range", async () => {
      if (!workerAvailable) return
      const pieceId = `test-piece-measure-${Date.now()}`

      // XML with 2 measures
      const twoMeasureXml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
  <work><work-title>Two Measure Test</work-title></work>
  <identification><creator type="composer">Test</creator></identification>
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>4</duration><type>whole</type><staff>1</staff><voice>1</voice>
      </note>
    </measure>
    <measure number="2">
      <note>
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>4</duration><type>whole</type><staff>1</staff><voice>1</voice>
      </note>
    </measure>
  </part>
</score-partwise>`

      await importPiece(pieceId, twoMeasureXml, `/test/${pieceId}.xml`)

      // Start session for measure 2 only
      const sessionResult = await startSessionWithPiece({
        pieceId,
        measureStart: 2,
        measureEnd: 2,
        hand: "both",
        tempo: 100,
      })

      // Should only have 1 note (from measure 2)
      expect(sessionResult.expectedNoteCount).toBe(1)

      const ws = await connectWebSocket(sessionResult.wsUrl)

      // Play D4 (the only note in measure 2)
      const result = await sendNote(ws, 62, 0)
      expect(result.type).toBe("result")
      if (result.type === "result") {
        expect(result.pitch).toBe(62)
        expect(result.result).toBe("correct")
      }

      ws.close()
      await endSession(sessionResult.sessionId).catch(() => {})
    })

    it("adjusts timing for different tempo", async () => {
      if (!workerAvailable) return
      const pieceId = `test-piece-tempo-${Date.now()}`

      await importPiece(pieceId, SIMPLE_XML, `/test/${pieceId}.xml`)

      // Start at 200% tempo (twice as fast)
      const sessionResult = await startSessionWithPiece({
        pieceId,
        measureStart: 1,
        measureEnd: 1,
        hand: "both",
        tempo: 200,
      })

      const ws = await connectWebSocket(sessionResult.wsUrl)

      // At 200% tempo, timing should be halved
      // Original: 0, 500, 1000, 1500
      // At 200%: 0, 250, 500, 750
      const results: WsServerMessage[] = []
      for (let i = 0; i < 4; i++) {
        const pitch = 60 + i * 2 // C4, D4 (skip), E4 (skip), F4 -> 60, 62, 64, 65
        const timestamp = i * 250 // Half the original timing
        const result = await sendNote(ws, [60, 62, 64, 65][i]!, timestamp)
        results.push(result)
      }

      // All should be correct with proper timing adjustment
      for (const result of results) {
        expect(result.type).toBe("result")
        if (result.type === "result") {
          expect(result.result).toBe("correct")
        }
      }

      ws.close()
      await endSession(sessionResult.sessionId).catch(() => {})
    })

    it("handles note-off events without returning extra", async () => {
      if (!workerAvailable) return
      const pieceId = `test-piece-noteoff-${Date.now()}`

      await importPiece(pieceId, SIMPLE_XML, `/test/${pieceId}.xml`)

      const sessionResult = await startSessionWithPiece({
        pieceId,
        measureStart: 1,
        measureEnd: 1,
        hand: "both",
        tempo: 100,
      })

      const ws = await connectWebSocket(sessionResult.wsUrl)

      // Send note-on
      const onResult = await sendNote(ws, 60, 0, 80, true)
      expect(onResult.type).toBe("result")
      if (onResult.type === "result") {
        expect(onResult.result).toBe("correct")
      }

      // Send note-off (on=false) - should return "extra" since noteOff is logged but not matched
      const offResult = await sendNote(ws, 60, 100, 0, false)
      expect(offResult.type).toBe("result")
      if (offResult.type === "result") {
        expect(offResult.result).toBe("extra") // Note-offs are tracked but considered extra
      }

      ws.close()
      await endSession(sessionResult.sessionId).catch(() => {})
    })

    it("preserves session state until end is called", async () => {
      if (!workerAvailable) return
      const pieceId = `test-piece-state-${Date.now()}`

      await importPiece(pieceId, SIMPLE_XML, `/test/${pieceId}.xml`)

      const sessionResult = await startSessionWithPiece({
        pieceId,
        measureStart: 1,
        measureEnd: 1,
        hand: "both",
        tempo: 100,
      })

      const ws = await connectWebSocket(sessionResult.wsUrl)

      // Play 2 notes
      await sendNote(ws, 60, 0)
      await sendNote(ws, 62, 500)

      // Close WebSocket
      ws.close()
      await new Promise(r => setTimeout(r, 100))

      // Reconnect (state should still be there)
      const ws2 = await connectWebSocket(sessionResult.wsUrl)

      // Play remaining notes
      await sendNote(ws2, 64, 1000)
      await sendNote(ws2, 65, 1500)

      ws2.close()

      // End session and check all 4 notes counted
      const endResult = await endSession(sessionResult.sessionId)
      expect(endResult.score.correct).toBe(4)
      expect(endResult.score.accuracy).toBe(1)
    })
  })

  describe("Edge cases and error handling", () => {
    it("handles WebSocket connection without prior init", async () => {
      if (!workerAvailable) return

      // Try to connect to a session that was never initialized
      const fakeSessionId = crypto.randomUUID()
      const wsUrl = `${WS_URL}/api/session/ws/${fakeSessionId}`

      await expect(connectWebSocket(wsUrl)).rejects.toThrow()
    })

    it("handles invalid JSON in WebSocket message", async () => {
      if (!workerAvailable) return
      const { sessionId, wsUrl } = await startSession("test-piece")
      const ws = await connectWebSocket(wsUrl)

      // Send invalid JSON - should be ignored, not crash connection
      ws.send("not valid json")

      // Connection should still work
      await new Promise(r => setTimeout(r, 100))
      expect(ws.readyState).toBe(WebSocket.OPEN)

      // Valid note should still work
      const result = await sendNote(ws, 60, 0)
      expect(result.type).toBe("result")

      ws.close()
      await endSession(sessionId).catch(() => {})
    })

    it("handles unknown message type", async () => {
      if (!workerAvailable) return
      const { sessionId, wsUrl } = await startSession("test-piece")
      const ws = await connectWebSocket(wsUrl)

      // Send unknown message type
      ws.send(JSON.stringify({ type: "unknown", data: "test" }))

      await new Promise(r => setTimeout(r, 100))
      expect(ws.readyState).toBe(WebSocket.OPEN)

      ws.close()
      await endSession(sessionId).catch(() => {})
    })

    it("classifies wrong pitches as wrong (not extra)", async () => {
      if (!workerAvailable) return
      const { sessionId, wsUrl } = await startSession("test-piece")
      const ws = await connectWebSocket(wsUrl)

      // Play correct first note
      await sendNote(ws, 60, 0)

      // Play 2 wrong notes (pitches that don't match expected notes)
      // These are classified as "wrong" because they're compared against
      // remaining expected notes in the time window
      await sendNote(ws, 50, 100)
      await sendNote(ws, 51, 200)

      ws.close()
      const endResult = await endSession(sessionId)

      expect(endResult.score.correct).toBe(1)
      // Wrong pitches are "wrong", not "extra" - they don't consume expected notes
      expect(endResult.score.extra).toBe(0)
      expect(endResult.score.missed).toBe(3) // 3 remaining notes never played
    })

    it("classifies notes as extra when all expected notes matched", async () => {
      if (!workerAvailable) return
      const { sessionId, wsUrl } = await startSession("test-piece")
      const ws = await connectWebSocket(wsUrl)

      // Play all 4 correct notes
      for (const note of [60, 62, 64, 65]) {
        await sendNote(ws, note, (note - 60) * 250)
      }

      // Now play extra notes - these should be "extra" since all expected matched
      await sendNote(ws, 70, 2000)
      await sendNote(ws, 71, 2100)

      ws.close()
      const endResult = await endSession(sessionId)

      expect(endResult.score.correct).toBe(4)
      expect(endResult.score.extra).toBe(2) // True extra notes
      expect(endResult.score.missed).toBe(0)
    })

    it("calculates missed notes correctly", async () => {
      if (!workerAvailable) return
      const { sessionId, wsUrl } = await startSession("test-piece")
      const ws = await connectWebSocket(wsUrl)

      // Only play first and last note
      await sendNote(ws, 60, 0)   // C4 - correct
      await sendNote(ws, 65, 1500) // F4 - correct

      ws.close()
      const endResult = await endSession(sessionId)

      expect(endResult.score.correct).toBe(2)
      expect(endResult.score.missed).toBe(2) // D4 and E4 missed
      expect(endResult.missedNotes).toHaveLength(2)
      expect(endResult.score.accuracy).toBe(0.5) // 2 correct out of 4 = 50%
    })

    it("returns 0% accuracy when no notes are correct", async () => {
      if (!workerAvailable) return
      const { sessionId, wsUrl } = await startSession("test-piece")
      const ws = await connectWebSocket(wsUrl)

      // Play only wrong notes (pitches that don't match any expected)
      await sendNote(ws, 50, 0)
      await sendNote(ws, 51, 500)

      ws.close()
      const endResult = await endSession(sessionId)

      expect(endResult.score.correct).toBe(0)
      expect(endResult.score.accuracy).toBe(0) // 0% when no correct notes
      expect(endResult.score.missed).toBe(4) // All 4 expected notes missed
    })
  })
})
