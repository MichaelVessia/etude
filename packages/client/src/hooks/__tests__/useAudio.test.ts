import { describe, expect, it, beforeEach, mock } from "bun:test"
import { renderHook, act, waitFor } from "@testing-library/react"
import {
  applyToneMocks,
  resetToneMocks,
  getMockPolySynthInstance,
  getMockPartInstances,
  getMockTransport,
  getMockContext,
} from "./mocks/tone.js"
import type { MidiPitch, Milliseconds } from "@etude/shared"
import type { NoteToPlay } from "../useAudio.js"

// Helper to create test notes with branded types
const note = (pitch: number, startTime: number, duration: number): NoteToPlay => ({
  pitch: pitch as MidiPitch,
  startTime: startTime as Milliseconds,
  duration: duration as Milliseconds,
})

// Apply mocks before importing useAudio
applyToneMocks(mock.module)

// Must import after mocks are applied
const { useAudio } = await import("../useAudio.js")

describe("useAudio", () => {
  beforeEach(() => {
    resetToneMocks()
  })

  describe("initialization", () => {
    it("initializes synth and becomes ready", async () => {
      const { result } = renderHook(() => useAudio())

      await waitFor(() => {
        expect(result.current.isReady).toBe(true)
      })

      const synth = getMockPolySynthInstance()
      expect(synth).not.toBeNull()
      expect(synth!.toDestination).toHaveBeenCalled()
    })

    it("starts with default state", async () => {
      const { result } = renderHook(() => useAudio())

      await waitFor(() => {
        expect(result.current.isReady).toBe(true)
      })

      expect(result.current.isPlaying).toBe(false)
      expect(result.current.currentTime).toBe(0)
      expect(result.current.tempo).toBe(100)
    })

    it("disposes synth on unmount", async () => {
      const { result, unmount } = renderHook(() => useAudio())

      await waitFor(() => {
        expect(result.current.isReady).toBe(true)
      })

      const synth = getMockPolySynthInstance()
      unmount()

      expect(synth!.dispose).toHaveBeenCalled()
    })
  })

  describe("play", () => {
    it("starts audio context if suspended", async () => {
      const { result } = renderHook(() => useAudio())

      await waitFor(() => {
        expect(result.current.isReady).toBe(true)
      })

      const context = getMockContext()
      expect(context.state).toBe("suspended")

      await act(async () => {
        await result.current.play()
      })

      expect(context.state).toBe("running")
    })

    it("starts transport and sets isPlaying", async () => {
      const { result } = renderHook(() => useAudio())

      await waitFor(() => {
        expect(result.current.isReady).toBe(true)
      })

      const transport = getMockTransport()

      await act(async () => {
        await result.current.play()
      })

      expect(transport.start).toHaveBeenCalled()
      expect(transport.state).toBe("started")
      expect(result.current.isPlaying).toBe(true)
    })
  })

  describe("pause", () => {
    it("pauses transport and sets isPlaying to false", async () => {
      const { result } = renderHook(() => useAudio())

      await waitFor(() => {
        expect(result.current.isReady).toBe(true)
      })

      const transport = getMockTransport()

      // Start playing first
      await act(async () => {
        await result.current.play()
      })

      expect(result.current.isPlaying).toBe(true)

      act(() => {
        result.current.pause()
      })

      expect(transport.pause).toHaveBeenCalled()
      expect(transport.state).toBe("paused")
      expect(result.current.isPlaying).toBe(false)
    })
  })

  describe("stop", () => {
    it("stops transport, resets time, and sets isPlaying to false", async () => {
      const { result } = renderHook(() => useAudio())

      await waitFor(() => {
        expect(result.current.isReady).toBe(true)
      })

      const transport = getMockTransport()
      transport.seconds = 5 // Simulate some playback

      // Start playing first
      await act(async () => {
        await result.current.play()
      })

      act(() => {
        result.current.stop()
      })

      expect(transport.stop).toHaveBeenCalled()
      expect(transport.state).toBe("stopped")
      expect(transport.seconds).toBe(0)
      expect(result.current.isPlaying).toBe(false)
      expect(result.current.currentTime).toBe(0)
    })
  })

  describe("setTempo", () => {
    it("updates tempo state and transport BPM", async () => {
      const { result } = renderHook(() => useAudio())

      await waitFor(() => {
        expect(result.current.isReady).toBe(true)
      })

      const transport = getMockTransport()

      act(() => {
        result.current.setTempo(150)
      })

      expect(result.current.tempo).toBe(150)
      // 120 * (150 / 100) = 180 BPM
      expect(transport.bpm.value).toBe(180)
    })

    it("handles 50% tempo (half speed)", async () => {
      const { result } = renderHook(() => useAudio())

      await waitFor(() => {
        expect(result.current.isReady).toBe(true)
      })

      const transport = getMockTransport()

      act(() => {
        result.current.setTempo(50)
      })

      expect(result.current.tempo).toBe(50)
      // 120 * (50 / 100) = 60 BPM
      expect(transport.bpm.value).toBe(60)
    })
  })

  describe("playNote", () => {
    it("plays a single note with default duration", async () => {
      const { result } = renderHook(() => useAudio())

      await waitFor(() => {
        expect(result.current.isReady).toBe(true)
      })

      // Set context to running to avoid async path
      const context = getMockContext()
      context.state = "running"

      const synth = getMockPolySynthInstance()

      act(() => {
        result.current.playNote(60) // C4
      })

      expect(synth!.triggerAttackRelease).toHaveBeenCalledWith("C4", 0.5)
    })

    it("plays a note with custom duration", async () => {
      const { result } = renderHook(() => useAudio())

      await waitFor(() => {
        expect(result.current.isReady).toBe(true)
      })

      const context = getMockContext()
      context.state = "running"

      const synth = getMockPolySynthInstance()

      act(() => {
        result.current.playNote(69, 1.0) // A4 for 1 second
      })

      expect(synth!.triggerAttackRelease).toHaveBeenCalledWith("A4", 1.0)
    })

    it("converts MIDI pitch to note name correctly", async () => {
      const { result } = renderHook(() => useAudio())

      await waitFor(() => {
        expect(result.current.isReady).toBe(true)
      })

      const context = getMockContext()
      context.state = "running"

      const synth = getMockPolySynthInstance()

      // Test various MIDI pitches
      const testCases = [
        { midi: 60, note: "C4" },
        { midi: 61, note: "C#4" },
        { midi: 62, note: "D4" },
        { midi: 63, note: "D#4" },
        { midi: 64, note: "E4" },
        { midi: 65, note: "F4" },
        { midi: 66, note: "F#4" },
        { midi: 67, note: "G4" },
        { midi: 68, note: "G#4" },
        { midi: 69, note: "A4" },
        { midi: 70, note: "A#4" },
        { midi: 71, note: "B4" },
        { midi: 72, note: "C5" },
        { midi: 48, note: "C3" },
      ]

      for (const { midi, note } of testCases) {
        synth!.triggerAttackRelease.mockClear()

        act(() => {
          result.current.playNote(midi)
        })

        expect(synth!.triggerAttackRelease).toHaveBeenCalledWith(note, 0.5)
      }
    })

    it("starts audio context if suspended before playing", async () => {
      const { result } = renderHook(() => useAudio())

      await waitFor(() => {
        expect(result.current.isReady).toBe(true)
      })

      const context = getMockContext()
      expect(context.state).toBe("suspended")

      act(() => {
        result.current.playNote(60)
      })

      // Context should be started (async)
      await waitFor(() => {
        expect(context.state).toBe("running")
      })
    })
  })

  describe("loadNotes", () => {
    it("creates a Tone.Part with notes", async () => {
      const { result } = renderHook(() => useAudio())

      await waitFor(() => {
        expect(result.current.isReady).toBe(true)
      })

      act(() => {
        result.current.loadNotes([
          note(60, 0, 500),
          note(62, 500, 500),
        ])
      })

      const parts = getMockPartInstances()
      expect(parts.length).toBe(1)
      expect(parts[0].start).toHaveBeenCalledWith(0)
    })

    it("disposes previous part when loading new notes", async () => {
      const { result } = renderHook(() => useAudio())

      await waitFor(() => {
        expect(result.current.isReady).toBe(true)
      })

      act(() => {
        result.current.loadNotes([note(60, 0, 500)])
      })

      const firstPart = getMockPartInstances()[0]

      act(() => {
        result.current.loadNotes([note(62, 0, 500)])
      })

      expect(firstPart.dispose).toHaveBeenCalled()
      expect(getMockPartInstances().length).toBe(2)
    })
  })

  describe("loadMidi", () => {
    it("handles invalid base64 gracefully", async () => {
      const { result } = renderHook(() => useAudio())

      await waitFor(() => {
        expect(result.current.isReady).toBe(true)
      })

      // Should not throw
      act(() => {
        result.current.loadMidi("invalid-base64!")
      })

      // No part should be created for invalid input
      // (error is logged but hook continues working)
    })
  })
})
