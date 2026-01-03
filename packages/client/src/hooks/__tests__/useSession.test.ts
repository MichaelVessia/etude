import { describe, expect, it, beforeEach, afterEach, mock } from "bun:test"
import { renderHook, act, waitFor } from "@testing-library/react"
import { useSession } from "../useSession.js"
import type {
  SessionStartParams,
  SessionStartResult,
  SessionEndResult,
  ImportPieceResult,
} from "../useSession.js"
import type { WsServerMessage } from "@etude/shared"

// Mock WebSocket implementation
class MockWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  readyState = MockWebSocket.CONNECTING
  url: string

  onopen: ((event: Event) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null

  private sentMessages: string[] = []

  constructor(url: string) {
    this.url = url
    // Simulate async connection
    setTimeout(() => {
      if (this.readyState === MockWebSocket.CONNECTING) {
        this.readyState = MockWebSocket.OPEN
        this.onopen?.(new Event("open"))
      }
    }, 0)
  }

  send(data: string): void {
    this.sentMessages.push(data)
  }

  close(code?: number): void {
    this.readyState = MockWebSocket.CLOSED
    const event = new CloseEvent("close", { code: code ?? 1000, wasClean: true })
    this.onclose?.(event)
  }

  // Test helpers
  simulateMessage(data: WsServerMessage): void {
    const event = new MessageEvent("message", { data: JSON.stringify(data) })
    this.onmessage?.(event)
  }

  getSentMessages(): string[] {
    return this.sentMessages
  }
}

// Track created WebSocket instances
let mockWsInstances: MockWebSocket[] = []
let pendingTimeouts: ReturnType<typeof setTimeout>[] = []
const originalSetTimeout = globalThis.setTimeout

// Mock fetch globally
const mockFetch = mock(() => Promise.resolve(new Response()))

beforeEach(() => {
  mockFetch.mockReset()
  globalThis.fetch = mockFetch as unknown as typeof fetch

  mockWsInstances = []
  pendingTimeouts = []

  // Wrap setTimeout to track pending timeouts
  const wrappedSetTimeout = (fn: (...args: unknown[]) => void, delay: number) => {
    const id = originalSetTimeout(fn, delay)
    pendingTimeouts.push(id)
    return id
  }
  globalThis.setTimeout = wrappedSetTimeout as typeof setTimeout

  // @ts-expect-error - mocking global WebSocket
  globalThis.WebSocket = class extends MockWebSocket {
    constructor(url: string) {
      super(url)
      mockWsInstances.push(this)
    }
  }
})

afterEach(() => {
  // Clear all pending timeouts
  for (const id of pendingTimeouts) {
    clearTimeout(id)
  }
  pendingTimeouts = []
  mockWsInstances = []
  globalThis.setTimeout = originalSetTimeout
})

// Helper to create mock responses
function mockJsonResponse<T>(data: T, ok = true): Response {
  return new Response(JSON.stringify(data), {
    status: ok ? 200 : 400,
    headers: { "Content-Type": "application/json" },
  })
}

describe("useSession", () => {
  describe("initial state", () => {
    it("starts with inactive state", async () => {
      // Mock refreshState call on mount
      mockFetch.mockResolvedValueOnce(mockJsonResponse({ active: false }))

      const { result, unmount } = renderHook(() => useSession())

      expect(result.current.isActive).toBe(false)
      expect(result.current.isLoading).toBe(false)
      expect(result.current.error).toBeNull()
      expect(result.current.sessionState).toBeNull()
      expect(result.current.lastNoteResult).toBeNull()
      expect(result.current.results).toBeNull()
      unmount()
    })

    it("refreshes state on mount", async () => {
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({
          active: true,
          sessionId: "existing-session",
          pieceId: "piece-1",
        })
      )

      const { result, unmount } = renderHook(() => useSession())

      await waitFor(() => {
        expect(result.current.isActive).toBe(true)
      })

      expect(result.current.sessionState?.sessionId).toBe("existing-session")
      unmount()
    })
  })

  describe("startSession", () => {
    it("transitions to active state on success", async () => {
      // Mock initial refreshState
      mockFetch.mockResolvedValueOnce(mockJsonResponse({ active: false }))

      const { result, unmount } = renderHook(() => useSession())

      const mockStartResult: SessionStartResult & { wsUrl: string } = {
        sessionId: "session-123",
        wsUrl: "ws://localhost:8787/api/session/ws/session-123",
        expectedNoteCount: 50,
        measureRange: [1, 4],
      }

      mockFetch.mockResolvedValueOnce(mockJsonResponse(mockStartResult))

      const params: SessionStartParams = {
        pieceId: "piece-1",
        measureStart: 1,
        measureEnd: 4,
        hand: "both",
        tempo: 120,
      }

      let startResult: SessionStartResult | null = null
      await act(async () => {
        startResult = await result.current.startSession(params)
      })

      expect(startResult).toMatchObject({ sessionId: "session-123" })
      expect(result.current.isActive).toBe(true)
      expect(result.current.isLoading).toBe(false)
      expect(result.current.sessionState).toMatchObject({
        active: true,
        sessionId: "session-123",
        pieceId: "piece-1",
        expectedNoteCount: 50,
        playedNoteCount: 0,
        matchedCount: 0,
        hand: "both",
        tempo: 120,
      })
      unmount()
    })

    it("sets error on failure", async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse({ active: false }))

      const { result, unmount } = renderHook(() => useSession())

      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({ error: "Piece not found" }, false)
      )

      const params: SessionStartParams = {
        pieceId: "nonexistent",
        measureStart: 1,
        measureEnd: 4,
        hand: "both",
        tempo: 120,
      }

      await act(async () => {
        await result.current.startSession(params)
      })

      expect(result.current.isActive).toBe(false)
      expect(result.current.error).toBe("Piece not found")
      unmount()
    })

    it("connects WebSocket after start", async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse({ active: false }))

      const { result, unmount } = renderHook(() => useSession())

      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({
          sessionId: "session-123",
          wsUrl: "ws://localhost:8787/api/session/ws/session-123",
          expectedNoteCount: 50,
          measureRange: [1, 4],
        })
      )

      await act(async () => {
        await result.current.startSession({
          pieceId: "piece-1",
          measureStart: 1,
          measureEnd: 4,
          hand: "both",
          tempo: 120,
        })
      })

      // Wait for WebSocket to be created
      await waitFor(() => {
        expect(mockWsInstances.length).toBe(1)
      })

      expect(mockWsInstances[0]?.url).toBe("ws://localhost:8787/api/session/ws/session-123")
      unmount()
    })
  })

  describe("submitNote", () => {
    it("does not send when not ready", async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse({ active: false }))

      const { result, unmount } = renderHook(() => useSession())

      // Try to send note without starting session
      act(() => {
        result.current.submitNote(60, 100, true)
      })

      // No WebSocket should be created
      expect(mockWsInstances.length).toBe(0)
      unmount()
    })

    // Note: WebSocket note sending is tested in useNoteStream.test.ts
    // and integration tests in ws-integration.test.ts
  })

  describe("endSession", () => {
    it("returns null when session is not active", async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse({ active: false }))

      const { result, unmount } = renderHook(() => useSession())

      let endResult: SessionEndResult | null = null
      await act(async () => {
        endResult = await result.current.endSession()
      })

      expect(endResult).toBeNull()
      unmount()
    })

    // Note: Full endSession flow with results is tested in integration tests
    // (ws-integration.test.ts)
  })

  describe("importPiece", () => {
    it("imports piece successfully", async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse({ active: false }))

      const { result, unmount } = renderHook(() => useSession())

      const mockImportResult: ImportPieceResult = {
        id: "piece-new",
        name: "Moonlight Sonata",
        totalMeasures: 200,
        noteCount: 1500,
      }

      mockFetch.mockResolvedValueOnce(mockJsonResponse(mockImportResult))

      let importResult: ImportPieceResult | null = null
      await act(async () => {
        importResult = await result.current.importPiece({
          id: "piece-new",
          xml: "<musicxml>...</musicxml>",
          filePath: "/path/to/moonlight.xml",
        })
      })

      expect(importResult).not.toBeNull()
      expect(importResult).toMatchObject(mockImportResult)
      unmount()
    })

    it("sets error on import failure", async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse({ active: false }))

      const { result, unmount } = renderHook(() => useSession())

      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({ error: "Invalid MusicXML" }, false)
      )

      await act(async () => {
        await result.current.importPiece({
          id: "piece-bad",
          xml: "not valid xml",
          filePath: "/path/to/bad.xml",
        })
      })

      expect(result.current.error).toBe("Invalid MusicXML")
      unmount()
    })
  })
})
