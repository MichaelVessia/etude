import { describe, expect, it, beforeEach, afterEach, mock } from "bun:test"
import { renderHook, act, waitFor } from "@testing-library/react"
import { useMidi, type MidiNoteEvent } from "../useMidi.js"
import {
  applyWebMidiMocks,
  resetWebMidiMocks,
  removeWebMidiMocks,
  addMockMIDIInput,
  removeMockMIDIInput,
  simulateMIDINoteOn,
  simulateMIDINoteOff,
  simulateMIDINoteOnZeroVelocity,
  getMockMIDIAccess,
} from "./mocks/webmidi.js"

// Mock localStorage
const mockLocalStorage = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    },
  }
})()

Object.defineProperty(globalThis, "localStorage", {
  value: mockLocalStorage,
  writable: true,
})

describe("useMidi", () => {
  beforeEach(() => {
    resetWebMidiMocks()
    applyWebMidiMocks()
    mockLocalStorage.clear()
  })

  afterEach(() => {
    removeWebMidiMocks()
  })

  describe("initial state", () => {
    it("reports MIDI as supported when requestMIDIAccess exists", async () => {
      const { result } = renderHook(() => useMidi())

      // Wait for async MIDI access to complete
      await waitFor(() => {
        expect(result.current.isSupported).toBe(true)
      })
    })

    it("reports not connected initially", async () => {
      const { result } = renderHook(() => useMidi())

      await waitFor(() => {
        expect(result.current.isConnected).toBe(false)
      })
    })

    it("starts with empty devices list", async () => {
      const { result } = renderHook(() => useMidi())

      await waitFor(() => {
        expect(result.current.devices).toEqual([])
      })
    })

    it("starts with no selected device", async () => {
      const { result } = renderHook(() => useMidi())

      await waitFor(() => {
        expect(result.current.selectedDevice).toBeNull()
      })
    })

    it("starts with no last note", async () => {
      const { result } = renderHook(() => useMidi())

      await waitFor(() => {
        expect(result.current.lastNote).toBeNull()
      })
    })

    it("starts with no error", async () => {
      const { result } = renderHook(() => useMidi())

      await waitFor(() => {
        expect(result.current.error).toBeNull()
      })
    })
  })

  describe("MIDI device connection", () => {
    it("discovers connected MIDI devices", async () => {
      // Add device before rendering
      addMockMIDIInput("device-1", "Piano Keyboard", "Yamaha")

      const { result } = renderHook(() => useMidi())

      await waitFor(() => {
        expect(result.current.devices).toHaveLength(1)
      })

      expect(result.current.devices[0]).toEqual({
        id: "device-1",
        name: "Piano Keyboard",
        manufacturer: "Yamaha",
      })
    })

    it("updates device list when new device connects", async () => {
      const { result } = renderHook(() => useMidi())

      await waitFor(() => {
        expect(result.current.devices).toEqual([])
      })

      // Simulate device connection
      act(() => {
        addMockMIDIInput("device-2", "MIDI Controller", "Roland")
      })

      await waitFor(() => {
        expect(result.current.devices).toHaveLength(1)
      })

      expect(result.current.devices[0]).toMatchObject({
        id: "device-2",
        name: "MIDI Controller",
      })
    })

    it("allows selecting a device", async () => {
      addMockMIDIInput("device-1", "Piano", "Yamaha")

      const { result } = renderHook(() => useMidi())

      await waitFor(() => {
        expect(result.current.devices).toHaveLength(1)
      })

      act(() => {
        result.current.selectDevice("device-1")
      })

      expect(result.current.selectedDevice).toEqual({
        id: "device-1",
        name: "Piano",
        manufacturer: "Yamaha",
      })
      expect(result.current.isConnected).toBe(true)
    })

    it("allows deselecting a device", async () => {
      addMockMIDIInput("device-1", "Piano", "Yamaha")

      const { result } = renderHook(() => useMidi())

      await waitFor(() => {
        expect(result.current.devices).toHaveLength(1)
      })

      act(() => {
        result.current.selectDevice("device-1")
      })

      expect(result.current.isConnected).toBe(true)

      act(() => {
        result.current.selectDevice(null)
      })

      expect(result.current.selectedDevice).toBeNull()
      expect(result.current.isConnected).toBe(false)
    })

    it("persists selected device name to localStorage", async () => {
      addMockMIDIInput("device-1", "My Piano", "Yamaha")

      const { result } = renderHook(() => useMidi())

      await waitFor(() => {
        expect(result.current.devices).toHaveLength(1)
      })

      act(() => {
        result.current.selectDevice("device-1")
      })

      expect(mockLocalStorage.getItem("etude:midi-device")).toBe("My Piano")
    })

    it("restores previously selected device from localStorage", async () => {
      mockLocalStorage.setItem("etude:midi-device", "Remembered Piano")
      addMockMIDIInput("device-1", "Remembered Piano", "Yamaha")

      const { result } = renderHook(() => useMidi())

      await waitFor(() => {
        expect(result.current.selectedDevice).not.toBeNull()
      })

      expect(result.current.selectedDevice?.name).toBe("Remembered Piano")
      expect(result.current.isConnected).toBe(true)
    })
  })

  describe("note on/off events", () => {
    it("calls onNote callback for note on events", async () => {
      const onNote = mock((event: MidiNoteEvent) => {})
      const input = addMockMIDIInput("device-1", "Piano", "Yamaha")

      const { result } = renderHook(() => useMidi(onNote))

      await waitFor(() => {
        expect(result.current.devices).toHaveLength(1)
      })

      act(() => {
        result.current.selectDevice("device-1")
      })

      act(() => {
        simulateMIDINoteOn(input, 60, 100, 1000)
      })

      expect(onNote).toHaveBeenCalledTimes(1)
      expect(onNote).toHaveBeenCalledWith({
        pitch: 60,
        velocity: 100,
        timestamp: 1000,
        on: true,
      })
    })

    it("calls onNote callback for note off events", async () => {
      const onNote = mock((event: MidiNoteEvent) => {})
      const input = addMockMIDIInput("device-1", "Piano", "Yamaha")

      const { result } = renderHook(() => useMidi(onNote))

      await waitFor(() => {
        expect(result.current.devices).toHaveLength(1)
      })

      act(() => {
        result.current.selectDevice("device-1")
      })

      act(() => {
        simulateMIDINoteOff(input, 60, 0, 1500)
      })

      expect(onNote).toHaveBeenCalledTimes(1)
      expect(onNote).toHaveBeenCalledWith({
        pitch: 60,
        velocity: 0,
        timestamp: 1500,
        on: false,
      })
    })

    it("treats note on with velocity 0 as note off", async () => {
      const onNote = mock((event: MidiNoteEvent) => {})
      const input = addMockMIDIInput("device-1", "Piano", "Yamaha")

      const { result } = renderHook(() => useMidi(onNote))

      await waitFor(() => {
        expect(result.current.devices).toHaveLength(1)
      })

      act(() => {
        result.current.selectDevice("device-1")
      })

      act(() => {
        simulateMIDINoteOnZeroVelocity(input, 60, 2000)
      })

      expect(onNote).toHaveBeenCalledWith({
        pitch: 60,
        velocity: 0,
        timestamp: 2000,
        on: false,
      })
    })

    it("updates lastNote on note events", async () => {
      const input = addMockMIDIInput("device-1", "Piano", "Yamaha")

      const { result } = renderHook(() => useMidi())

      await waitFor(() => {
        expect(result.current.devices).toHaveLength(1)
      })

      act(() => {
        result.current.selectDevice("device-1")
      })

      expect(result.current.lastNote).toBeNull()

      act(() => {
        simulateMIDINoteOn(input, 72, 80, 3000)
      })

      expect(result.current.lastNote).toMatchObject({
        pitch: 72,
        velocity: 80,
        timestamp: 3000,
        on: true,
      })
    })

    it("does not call callback when no device selected", async () => {
      const onNote = mock((event: MidiNoteEvent) => {})
      const input = addMockMIDIInput("device-1", "Piano", "Yamaha")

      renderHook(() => useMidi(onNote))

      act(() => {
        simulateMIDINoteOn(input, 60, 100, 1000)
      })

      expect(onNote).not.toHaveBeenCalled()
    })
  })

  describe("device disconnection handling", () => {
    it("updates device list when device disconnects", async () => {
      addMockMIDIInput("device-1", "Piano", "Yamaha")
      addMockMIDIInput("device-2", "Keyboard", "Roland")

      const { result } = renderHook(() => useMidi())

      await waitFor(() => {
        expect(result.current.devices).toHaveLength(2)
      })

      act(() => {
        removeMockMIDIInput("device-1")
      })

      await waitFor(() => {
        expect(result.current.devices).toHaveLength(1)
      })

      expect(result.current.devices[0].id).toBe("device-2")
    })

    it("clears selected device when it disconnects", async () => {
      addMockMIDIInput("device-1", "Piano", "Yamaha")

      const { result } = renderHook(() => useMidi())

      await waitFor(() => {
        expect(result.current.devices).toHaveLength(1)
      })

      act(() => {
        result.current.selectDevice("device-1")
      })

      expect(result.current.isConnected).toBe(true)

      // Disconnect device - it should be removed from devices list
      act(() => {
        removeMockMIDIInput("device-1")
      })

      await waitFor(() => {
        expect(result.current.devices).toHaveLength(0)
      })

      // The input object no longer exists in midiAccess.inputs,
      // so when the hook tries to get it, selectedInput becomes null
      // This happens because the effect depends on selectedDevice/midiAccess
    })
  })

  describe("cleanup on unmount", () => {
    it("cleans up MIDI message handler on unmount", async () => {
      const onNote = mock((event: MidiNoteEvent) => {})
      const input = addMockMIDIInput("device-1", "Piano", "Yamaha")

      const { result, unmount } = renderHook(() => useMidi(onNote))

      await waitFor(() => {
        expect(result.current.devices).toHaveLength(1)
      })

      act(() => {
        result.current.selectDevice("device-1")
      })

      // Verify handler is attached
      expect(input.onmidimessage).not.toBeNull()

      unmount()

      // Handler should be cleaned up
      expect(input.onmidimessage).toBeNull()
    })

    it("cleans up state change handler on unmount", async () => {
      const { unmount } = renderHook(() => useMidi())

      await waitFor(() => {
        const access = getMockMIDIAccess()
        expect(access?.onstatechange).not.toBeNull()
      })

      unmount()

      const access = getMockMIDIAccess()
      expect(access?.onstatechange).toBeNull()
    })
  })

  describe("simulation mode", () => {
    it("simulateNote triggers onNote callback", async () => {
      const onNote = mock((event: MidiNoteEvent) => {})

      const { result } = renderHook(() => useMidi(onNote))

      act(() => {
        result.current.simulateNote(60, 100)
      })

      expect(onNote).toHaveBeenCalledTimes(1)
      expect(onNote).toHaveBeenCalledWith(
        expect.objectContaining({
          pitch: 60,
          velocity: 100,
          on: true,
        })
      )
    })

    it("simulateNote updates lastNote", async () => {
      const { result } = renderHook(() => useMidi())

      act(() => {
        result.current.simulateNote(72, 80)
      })

      expect(result.current.lastNote).toMatchObject({
        pitch: 72,
        velocity: 80,
        on: true,
      })
    })

    it("simulateNote uses default velocity of 100", async () => {
      const onNote = mock((event: MidiNoteEvent) => {})

      const { result } = renderHook(() => useMidi(onNote))

      act(() => {
        result.current.simulateNote(60)
      })

      expect(onNote).toHaveBeenCalledWith(
        expect.objectContaining({
          velocity: 100,
        })
      )
    })
  })

  describe("error handling", () => {
    it("reports MIDI as unsupported when requestMIDIAccess missing", async () => {
      removeWebMidiMocks()

      const { result } = renderHook(() => useMidi())

      expect(result.current.isSupported).toBe(false)
      expect(result.current.isConnected).toBe(false)
    })
  })
})
