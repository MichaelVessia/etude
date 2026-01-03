import { describe, expect, it, beforeEach, afterEach, mock } from "bun:test"
import { renderHook, act, waitFor } from "@testing-library/react"
import { useNoteStream } from "../useNoteStream.js"
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

  close(code?: number, _reason?: string): void {
    this.readyState = MockWebSocket.CLOSED
    const event = new CloseEvent("close", { code: code ?? 1000, wasClean: true })
    this.onclose?.(event)
  }

  // Test helpers
  simulateMessage(data: WsServerMessage): void {
    const event = new MessageEvent("message", { data: JSON.stringify(data) })
    this.onmessage?.(event)
  }

  simulateError(): void {
    this.onerror?.(new Event("error"))
  }

  simulateUncleanClose(code = 1006): void {
    this.readyState = MockWebSocket.CLOSED
    const event = new CloseEvent("close", { code, wasClean: false })
    this.onclose?.(event)
  }

  getSentMessages(): string[] {
    return this.sentMessages
  }
}

// Track created instances and pending timeouts for cleanup
let mockInstances: MockWebSocket[] = []
let pendingTimeouts: ReturnType<typeof setTimeout>[] = []
const originalSetTimeout = globalThis.setTimeout

beforeEach(() => {
  mockInstances = []
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
      mockInstances.push(this)
    }
  }
})

afterEach(() => {
  // Clear all pending timeouts from this test
  for (const id of pendingTimeouts) {
    clearTimeout(id)
  }
  pendingTimeouts = []
  mockInstances = []
  globalThis.setTimeout = originalSetTimeout
})

describe("useNoteStream", () => {
  describe("initial state", () => {
    it("starts disconnected with null wsUrl", () => {
      const { result } = renderHook(() => useNoteStream(null))

      expect(result.current.connected).toBe(false)
      expect(result.current.ready).toBe(false)
      expect(result.current.lastResult).toBeNull()
      expect(result.current.sessionScore).toBeNull()
      expect(result.current.error).toBeNull()
    })
  })

  describe("connection lifecycle", () => {
    it("connects when wsUrl is provided", async () => {
      renderHook(() => useNoteStream("ws://localhost:8787/ws"))

      // Wait for WebSocket to open
      await waitFor(() => {
        expect(mockInstances.length).toBe(1)
      })

      expect(mockInstances[0]?.url).toBe("ws://localhost:8787/ws")
    })

    it("sets connected=true on open", async () => {
      const { result } = renderHook(() => useNoteStream("ws://localhost:8787/ws"))

      await waitFor(() => {
        expect(result.current.connected).toBe(true)
      })
    })

    it("sets ready=true on ready message", async () => {
      const { result } = renderHook(() => useNoteStream("ws://localhost:8787/ws"))

      await waitFor(() => {
        expect(mockInstances.length).toBe(1)
      })

      act(() => {
        mockInstances[0]?.simulateMessage({ type: "ready", sessionId: "test-session" })
      })

      expect(result.current.ready).toBe(true)
    })

    it("cleans up on unmount", async () => {
      const { unmount } = renderHook(() => useNoteStream("ws://localhost:8787/ws"))

      await waitFor(() => {
        expect(mockInstances.length).toBe(1)
      })

      unmount()

      expect(mockInstances[0]?.readyState).toBe(MockWebSocket.CLOSED)
    })

    it("reconnects when wsUrl changes", async () => {
      const { rerender } = renderHook(
        ({ url }) => useNoteStream(url),
        { initialProps: { url: "ws://localhost:8787/ws/session1" } }
      )

      await waitFor(() => {
        expect(mockInstances.length).toBe(1)
      })

      rerender({ url: "ws://localhost:8787/ws/session2" })

      await waitFor(() => {
        expect(mockInstances.length).toBe(2)
      })

      expect(mockInstances[1]?.url).toBe("ws://localhost:8787/ws/session2")
    })
  })

  describe("sending notes", () => {
    it("sends note message when connected", async () => {
      const { result } = renderHook(() => useNoteStream("ws://localhost:8787/ws"))

      await waitFor(() => {
        expect(result.current.connected).toBe(true)
      })

      act(() => {
        result.current.sendNote(60, 100, 0, true)
      })

      const sent = mockInstances[0]?.getSentMessages()
      expect(sent?.length).toBe(1)
      expect(JSON.parse(sent![0]!)).toEqual({
        type: "note",
        pitch: 60,
        velocity: 100,
        timestamp: 0,
        on: true,
      })
    })

    it("does not send when not connected", () => {
      const { result } = renderHook(() => useNoteStream(null))

      act(() => {
        result.current.sendNote(60, 100, 0, true)
      })

      // No WebSocket created, no messages sent
      expect(mockInstances.length).toBe(0)
    })
  })

  describe("receiving messages", () => {
    it("updates lastResult on result message", async () => {
      const { result } = renderHook(() => useNoteStream("ws://localhost:8787/ws"))

      await waitFor(() => {
        expect(mockInstances.length).toBe(1)
      })

      act(() => {
        mockInstances[0]?.simulateMessage({
          type: "result",
          pitch: 60,
          result: "correct",
          timingOffset: 25,
          expectedNoteTime: 0,
        })
      })

      expect(result.current.lastResult).toEqual({
        pitch: 60,
        result: "correct",
        timingOffset: 25,
        expectedNoteTime: 0,
      })
    })

    it("updates sessionScore on sessionEnd message", async () => {
      const { result } = renderHook(() => useNoteStream("ws://localhost:8787/ws"))

      await waitFor(() => {
        expect(mockInstances.length).toBe(1)
      })

      const mockScore = {
        correct: 10,
        early: 2,
        late: 1,
        extra: 0,
        missed: 1,
        accuracy: 0.9,
      }

      act(() => {
        mockInstances[0]?.simulateMessage({
          type: "sessionEnd",
          score: mockScore,
        })
      })

      expect(result.current.sessionScore).toEqual(mockScore)
    })

    it("responds to ping with pong", async () => {
      const { result } = renderHook(() => useNoteStream("ws://localhost:8787/ws"))

      await waitFor(() => {
        expect(result.current.connected).toBe(true)
      })

      act(() => {
        mockInstances[0]?.simulateMessage({ type: "ping" })
      })

      const sent = mockInstances[0]?.getSentMessages()
      expect(sent?.length).toBe(1)
      expect(JSON.parse(sent![0]!)).toEqual({ type: "pong" })
    })
  })

  describe("error handling", () => {
    it("retries on unexpected close", async () => {
      const { unmount } = renderHook(() => useNoteStream("ws://localhost:8787/ws"))

      await waitFor(() => {
        expect(mockInstances.length).toBe(1)
      })

      const firstInstance = mockInstances[0]

      // Simulate unexpected close
      act(() => {
        firstInstance?.simulateUncleanClose(1006)
      })

      // Wait for retry (1 second delay)
      await waitFor(
        () => {
          expect(mockInstances.length).toBeGreaterThan(1)
        },
        { timeout: 2000 }
      )

      // Verify new instance was created
      expect(mockInstances[mockInstances.length - 1]?.url).toBe("ws://localhost:8787/ws")

      // Clean up to stop retry loop
      unmount()
    })

    it("sets error after max retries", async () => {
      const onError = mock(() => {})
      const { result, unmount } = renderHook(() =>
        useNoteStream("ws://localhost:8787/ws", { maxRetries: 0, onError })
      )

      await waitFor(() => {
        expect(mockInstances.length).toBe(1)
      })

      // Close triggers error immediately with maxRetries=0
      act(() => {
        mockInstances[0]?.simulateUncleanClose(1006)
      })

      await waitFor(() => {
        expect(result.current.error).toBe("Connection failed after retries")
      })

      expect(onError).toHaveBeenCalled()
      unmount()
    })

    it("does not retry on clean close", async () => {
      const { result, unmount } = renderHook(() => useNoteStream("ws://localhost:8787/ws"))

      await waitFor(() => {
        expect(mockInstances.length).toBe(1)
      })

      act(() => {
        mockInstances[0]?.close(1000, "Normal close")
      })

      // Wait a bit to ensure no retry happens
      await new Promise((r) => setTimeout(r, 100))

      expect(mockInstances.length).toBe(1) // No new instances
      expect(result.current.error).toBeNull()
      unmount()
    })

    it("calls onClose callback", async () => {
      const onClose = mock(() => {})
      const { unmount } = renderHook(() =>
        useNoteStream("ws://localhost:8787/ws", { onClose })
      )

      await waitFor(() => {
        expect(mockInstances.length).toBe(1)
      })

      act(() => {
        mockInstances[0]?.close(1000)
      })

      expect(onClose).toHaveBeenCalled()
      unmount()
    })
  })
})
