import { useCallback, useEffect, useState } from "react"
import type { MidiPitch, Velocity, Milliseconds } from "@etude/shared"

export interface MidiDevice {
  id: string
  name: string
  manufacturer: string
}

export interface MidiNoteEvent {
  pitch: MidiPitch
  velocity: Velocity
  timestamp: Milliseconds
  on: boolean
}

export interface UseMidiResult {
  isSupported: boolean
  isConnected: boolean
  devices: MidiDevice[]
  selectedDevice: MidiDevice | null
  selectDevice: (id: string | null) => void
  lastNote: MidiNoteEvent | null
  error: string | null
  /** Inject a simulated note (for dev testing without hardware) */
  simulateNote: (pitch: number, velocity?: number) => void
  /** Enable simulation mode (sets isConnected to true in dev) */
  enableSimulation: () => void
}

// MIDI status bytes
const NOTE_OFF_MIN = 0x80
const NOTE_OFF_MAX = 0x8f
const NOTE_ON_MIN = 0x90
const NOTE_ON_MAX = 0x9f

const STORAGE_KEY = "etude:midi-device"

function getStoredDeviceName(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

function storeDeviceName(name: string | null): void {
  try {
    if (name) {
      localStorage.setItem(STORAGE_KEY, name)
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  } catch {
    // Ignore storage errors
  }
}

export function useMidi(onNote?: (event: MidiNoteEvent) => void): UseMidiResult {
  const [isSupported] = useState(() => "requestMIDIAccess" in navigator)
  const [midiAccess, setMidiAccess] = useState<MIDIAccess | null>(null)
  const [devices, setDevices] = useState<MidiDevice[]>([])
  const [selectedDevice, setSelectedDevice] = useState<MidiDevice | null>(null)
  const [selectedInput, setSelectedInput] = useState<MIDIInput | null>(null)
  const [lastNote, setLastNote] = useState<MidiNoteEvent | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [simulationMode, setSimulationMode] = useState(false)

  // Request MIDI access on mount
  useEffect(() => {
    if (!isSupported) return

    navigator
      .requestMIDIAccess()
      .then((access) => {
        setMidiAccess(access)
        setError(null)
      })
      .catch((err) => {
        setError(`MIDI access denied: ${err.message}`)
      })
  }, [isSupported])

  // Update device list when MIDI access changes
  useEffect(() => {
    if (!midiAccess) return

    const updateDevices = () => {
      const inputDevices: MidiDevice[] = []
      midiAccess.inputs.forEach((input) => {
        inputDevices.push({
          id: input.id,
          name: input.name ?? "Unknown",
          manufacturer: input.manufacturer ?? "Unknown",
        })
      })
      setDevices(inputDevices)

      // Auto-select remembered device if no device currently selected
      setSelectedDevice((current) => {
        if (current !== null) return current
        const storedName = getStoredDeviceName()
        if (!storedName) return null
        return inputDevices.find((d) => d.name === storedName) ?? null
      })
    }

    updateDevices()
    midiAccess.onstatechange = updateDevices

    return () => {
      midiAccess.onstatechange = null
    }
  }, [midiAccess])

  // Handle MIDI messages
  const handleMidiMessage = useCallback(
    (event: MIDIMessageEvent) => {
      const [status, note, velocity] = event.data ?? []
      if (status === undefined || note === undefined) return

      let isOn = false
      if (status >= NOTE_ON_MIN && status <= NOTE_ON_MAX && velocity! > 0) {
        isOn = true
      } else if (
        (status >= NOTE_OFF_MIN && status <= NOTE_OFF_MAX) ||
        (status >= NOTE_ON_MIN && status <= NOTE_ON_MAX && velocity === 0)
      ) {
        isOn = false
      } else {
        // Ignore other MIDI messages (control change, pitch bend, etc.)
        return
      }

      const noteEvent: MidiNoteEvent = {
        pitch: note as MidiPitch,
        velocity: (velocity ?? 0) as Velocity,
        timestamp: event.timeStamp as Milliseconds,
        on: isOn,
      }

      setLastNote(noteEvent)
      onNote?.(noteEvent)
    },
    [onNote]
  )

  // Connect to selected device
  useEffect(() => {
    if (!midiAccess || !selectedDevice) {
      setSelectedInput(null)
      return
    }

    const input = midiAccess.inputs.get(selectedDevice.id)
    if (!input) {
      setSelectedInput(null)
      return
    }

    input.onmidimessage = handleMidiMessage
    setSelectedInput(input)

    return () => {
      input.onmidimessage = null
    }
  }, [midiAccess, selectedDevice, handleMidiMessage])

  const selectDevice = useCallback(
    (id: string | null) => {
      if (!id) {
        setSelectedDevice(null)
        storeDeviceName(null)
        return
      }
      const device = devices.find((d) => d.id === id)
      setSelectedDevice(device ?? null)
      storeDeviceName(device?.name ?? null)
    },
    [devices]
  )

  // Simulate a note (for dev testing)
  const simulateNote = useCallback(
    (pitch: number, velocity = 100) => {
      const noteEvent: MidiNoteEvent = {
        pitch: pitch as MidiPitch,
        velocity: velocity as Velocity,
        timestamp: performance.now() as Milliseconds,
        on: true,
      }
      setLastNote(noteEvent)
      onNote?.(noteEvent)
    },
    [onNote]
  )

  // Enable simulation mode (for dev testing without hardware)
  const enableSimulation = useCallback(() => {
    if (import.meta.env.DEV) {
      setSimulationMode(true)
    }
  }, [])

  return {
    isSupported,
    isConnected: selectedInput !== null || simulationMode,
    devices,
    selectedDevice,
    selectDevice,
    lastNote,
    error,
    simulateNote,
    enableSimulation,
  }
}
