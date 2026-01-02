import { describe, expect, it, beforeEach, mock } from "bun:test"
import { renderHook, act, waitFor } from "@testing-library/react"
import { useSession } from "../useSession.js"
import type {
  SessionStartParams,
  SessionStartResult,
  NoteSubmitResult,
  SessionEndResult,
  ImportPieceResult,
} from "../useSession.js"

// Mock fetch globally
const mockFetch = mock(() => Promise.resolve(new Response()))

beforeEach(() => {
  mockFetch.mockReset()
  globalThis.fetch = mockFetch as unknown as typeof fetch
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
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({ active: false })
      )

      const { result } = renderHook(() => useSession())

      expect(result.current.isActive).toBe(false)
      expect(result.current.isLoading).toBe(false)
      expect(result.current.error).toBeNull()
      expect(result.current.sessionState).toBeNull()
      expect(result.current.lastNoteResult).toBeNull()
      expect(result.current.results).toBeNull()
    })

    it("refreshes state on mount", async () => {
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({
          active: true,
          sessionId: "existing-session",
          pieceId: "piece-1",
        })
      )

      const { result } = renderHook(() => useSession())

      await waitFor(() => {
        expect(result.current.isActive).toBe(true)
      })

      expect(result.current.sessionState?.sessionId).toBe("existing-session")
    })
  })

  describe("startSession", () => {
    it("transitions to active state on success", async () => {
      // Mock initial refreshState
      mockFetch.mockResolvedValueOnce(mockJsonResponse({ active: false }))

      const { result } = renderHook(() => useSession())

      const mockStartResult: SessionStartResult = {
        sessionId: "session-123",
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

      expect(startResult).not.toBeNull()
      expect(startResult).toMatchObject(mockStartResult)
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
    })

    it("sets loading state during request", async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse({ active: false }))

      const { result } = renderHook(() => useSession())

      // Create a deferred promise to control timing
      let resolveStart: (value: Response) => void
      const startPromise = new Promise<Response>((resolve) => {
        resolveStart = resolve
      })
      mockFetch.mockReturnValueOnce(startPromise)

      const params: SessionStartParams = {
        pieceId: "piece-1",
        measureStart: 1,
        measureEnd: 4,
        hand: "both",
        tempo: 120,
      }

      let startPromiseResult: Promise<SessionStartResult | null>
      act(() => {
        startPromiseResult = result.current.startSession(params)
      })

      // Should be loading
      expect(result.current.isLoading).toBe(true)

      // Resolve the request
      await act(async () => {
        resolveStart!(
          mockJsonResponse({
            sessionId: "session-123",
            expectedNoteCount: 50,
            measureRange: [1, 4],
          })
        )
        await startPromiseResult!
      })

      expect(result.current.isLoading).toBe(false)
    })

    it("sets error on failure", async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse({ active: false }))

      const { result } = renderHook(() => useSession())

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
    })

    it("clears previous results when starting new session", async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse({ active: false }))

      const { result } = renderHook(() => useSession())

      // Start and end a session to get results
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({
          sessionId: "session-1",
          expectedNoteCount: 10,
          measureRange: [1, 2],
        })
      )

      await act(async () => {
        await result.current.startSession({
          pieceId: "piece-1",
          measureStart: 1,
          measureEnd: 2,
          hand: "both",
          tempo: 120,
        })
      })

      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({
          attemptId: "attempt-1",
          noteAccuracy: 0.9,
          timingAccuracy: 0.8,
          combinedScore: 0.85,
          leftHandAccuracy: null,
          rightHandAccuracy: null,
          extraNotes: 0,
          missedNotes: [],
        })
      )

      await act(async () => {
        await result.current.endSession()
      })

      expect(result.current.results).not.toBeNull()

      // Start new session - results should be cleared
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({
          sessionId: "session-2",
          expectedNoteCount: 20,
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

      expect(result.current.results).toBeNull()
    })
  })

  describe("submitNote", () => {
    it("submits note during active session", async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse({ active: false }))

      const { result } = renderHook(() => useSession())

      // Start session
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({
          sessionId: "session-123",
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

      const mockNoteResult: NoteSubmitResult = {
        pitch: 60,
        result: "correct",
        timingOffset: 25,
        expectedNoteTime: 0,
      }

      mockFetch.mockResolvedValueOnce(mockJsonResponse(mockNoteResult))

      let noteResult: NoteSubmitResult | null = null
      await act(async () => {
        noteResult = await result.current.submitNote(60, 100, true)
      })

      expect(noteResult).not.toBeNull()
      expect(noteResult).toMatchObject(mockNoteResult)
      expect(result.current.lastNoteResult).toEqual(mockNoteResult)
    })

    it("updates playedNoteCount and matchedCount for correct notes", async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse({ active: false }))

      const { result } = renderHook(() => useSession())

      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({
          sessionId: "session-123",
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

      expect(result.current.sessionState?.playedNoteCount).toBe(0)
      expect(result.current.sessionState?.matchedCount).toBe(0)

      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({
          pitch: 60,
          result: "correct",
          timingOffset: 0,
          expectedNoteTime: 0,
        })
      )

      await act(async () => {
        await result.current.submitNote(60, 100, true)
      })

      expect(result.current.sessionState?.playedNoteCount).toBe(1)
      expect(result.current.sessionState?.matchedCount).toBe(1)
    })

    it("updates playedNoteCount but not matchedCount for wrong notes", async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse({ active: false }))

      const { result } = renderHook(() => useSession())

      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({
          sessionId: "session-123",
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

      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({
          pitch: 61,
          result: "wrong",
          timingOffset: 0,
          expectedNoteTime: null,
        })
      )

      await act(async () => {
        await result.current.submitNote(61, 100, true)
      })

      expect(result.current.sessionState?.playedNoteCount).toBe(1)
      expect(result.current.sessionState?.matchedCount).toBe(0)
    })

    it("returns null when session is not active", async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse({ active: false }))

      const { result } = renderHook(() => useSession())

      let noteResult: NoteSubmitResult | null = null
      await act(async () => {
        noteResult = await result.current.submitNote(60, 100, true)
      })

      expect(noteResult).toBeNull()
      // Fetch should only be called for initial refreshState
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it("does not update counts for note-off events", async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse({ active: false }))

      const { result } = renderHook(() => useSession())

      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({
          sessionId: "session-123",
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

      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({
          pitch: 60,
          result: "correct",
          timingOffset: 0,
          expectedNoteTime: 0,
        })
      )

      await act(async () => {
        await result.current.submitNote(60, 0, false) // note-off
      })

      expect(result.current.sessionState?.playedNoteCount).toBe(0)
      expect(result.current.sessionState?.matchedCount).toBe(0)
    })
  })

  describe("endSession", () => {
    it("transitions to results state", async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse({ active: false }))

      const { result } = renderHook(() => useSession())

      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({
          sessionId: "session-123",
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

      const mockEndResult: SessionEndResult = {
        attemptId: "attempt-123",
        noteAccuracy: 0.95,
        timingAccuracy: 0.88,
        combinedScore: 0.915,
        leftHandAccuracy: 0.9,
        rightHandAccuracy: 1.0,
        extraNotes: 2,
        missedNotes: [],
      }

      mockFetch.mockResolvedValueOnce(mockJsonResponse(mockEndResult))

      let endResult: SessionEndResult | null = null
      await act(async () => {
        endResult = await result.current.endSession()
      })

      expect(endResult).not.toBeNull()
      expect(endResult).toMatchObject(mockEndResult)
      expect(result.current.results).toEqual(mockEndResult)
      expect(result.current.isActive).toBe(false)
      expect(result.current.sessionState).toBeNull()
    })

    it("returns null when session is not active", async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse({ active: false }))

      const { result } = renderHook(() => useSession())

      let endResult: SessionEndResult | null = null
      await act(async () => {
        endResult = await result.current.endSession()
      })

      expect(endResult).toBeNull()
    })

    it("sets error on failure", async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse({ active: false }))

      const { result } = renderHook(() => useSession())

      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({
          sessionId: "session-123",
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

      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({ error: "Session corrupted" }, false)
      )

      await act(async () => {
        await result.current.endSession()
      })

      expect(result.current.error).toBe("Session corrupted")
    })
  })

  describe("refreshState", () => {
    it("updates session state from server", async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse({ active: false }))

      const { result } = renderHook(() => useSession())

      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({
          active: true,
          sessionId: "session-456",
          pieceId: "piece-2",
          expectedNoteCount: 30,
          playedNoteCount: 15,
          matchedCount: 12,
        })
      )

      await act(async () => {
        await result.current.refreshState()
      })

      expect(result.current.isActive).toBe(true)
      expect(result.current.sessionState?.sessionId).toBe("session-456")
      expect(result.current.sessionState?.playedNoteCount).toBe(15)
    })
  })

  describe("importPiece", () => {
    it("imports piece successfully", async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse({ active: false }))

      const { result } = renderHook(() => useSession())

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
    })

    it("sets error on import failure", async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse({ active: false }))

      const { result } = renderHook(() => useSession())

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
    })
  })
})
