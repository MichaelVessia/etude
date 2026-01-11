import { useCallback, useEffect, useState, useRef } from "react"
import type { MidiPitch, Velocity, Milliseconds } from "@etude/shared"
import { Effect, Stream, Fiber, pipe, Predicate } from "effect"
import * as EMIDIAccess from "effect-web-midi/EMIDIAccess"
import * as EMIDIInput from "effect-web-midi/EMIDIInput"
import * as Parsing from "effect-web-midi/Parsing"

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
  const [midiAccess, setMidiAccess] = useState<EMIDIAccess.EMIDIAccessInstance | null>(null)
  const [devices, setDevices] = useState<MidiDevice[]>([])
  const [selectedDevice, setSelectedDevice] = useState<MidiDevice | null>(null)
  const [isStreamActive, setIsStreamActive] = useState(false)
  const [lastNote, setLastNote] = useState<MidiNoteEvent | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [simulationMode, setSimulationMode] = useState(false)

  // Keep track of message stream fiber for cleanup
  const messageFiberRef = useRef<Fiber.RuntimeFiber<void, unknown> | null>(null)
  // Keep track of state change stream fiber for cleanup
  const stateChangeFiberRef = useRef<Fiber.RuntimeFiber<void, unknown> | null>(null)
  // Stable ref to onNote callback for use in stream
  const onNoteRef = useRef(onNote)
  onNoteRef.current = onNote

  // Request MIDI access on mount using effect-web-midi
  useEffect(() => {
    if (!isSupported) return

    // Use Effect.runPromiseExit to handle the effect-web-midi typed effect
    // and convert to plain promise for React state management
    Effect.runPromiseExit(EMIDIAccess.request())
      .then((exit) => {
        if (exit._tag === "Success") {
          setMidiAccess(exit.value)
          setError(null)
        } else {
          const cause = exit.cause
          const message = cause._tag === "Fail"
            ? String(cause.error)
            : "Unknown MIDI error"
          setError(`MIDI access denied: ${message}`)
        }
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err)
        setError(`MIDI access error: ${message}`)
      })
  }, [isSupported])

  // Update device list when MIDI access changes using effect-web-midi
  useEffect(() => {
    if (!midiAccess) return

    const updateDevices = () => {
      // Use Effect.runPromiseExit to get typed inputs as array
      Effect.runPromiseExit(EMIDIAccess.getInputsArray(midiAccess))
        .then((exit) => {
          if (exit._tag === "Success") {
            const inputDevices = exit.value.map((input) => ({
              id: input.id,
              name: input.name ?? "Unknown",
              manufacturer: input.manufacturer ?? "Unknown",
            }))
            setDevices(inputDevices)

            // Auto-select remembered device if no device currently selected
            setSelectedDevice((current) => {
              if (current !== null) return current
              const storedName = getStoredDeviceName()
              if (!storedName) return null
              return inputDevices.find((d) => d.name === storedName) ?? null
            })
          }
        })
        .catch(() => {
          // Ignore errors during device enumeration
        })
    }

    // Initial device list update
    updateDevices()

    // Create state change stream for hot-plug support using effect-web-midi
    const stateChangeStream = pipe(
      EMIDIAccess.makeAllPortsStateChangesStream(midiAccess),
      Stream.tap(() =>
        Effect.sync(() => {
          // Refresh device list on any port state change (connect/disconnect)
          updateDevices()
        })
      ),
      Stream.runDrain
    )

    // Run the state change stream as a fiber
    const fiber = Effect.runFork(stateChangeStream)
    stateChangeFiberRef.current = fiber

    return () => {
      // Cleanup: interrupt the state change fiber
      if (stateChangeFiberRef.current) {
        Effect.runFork(Fiber.interrupt(stateChangeFiberRef.current))
        stateChangeFiberRef.current = null
      }
    }
  }, [midiAccess])

  // Connect to selected device using effect-web-midi message stream
  useEffect(() => {
    if (!midiAccess || !selectedDevice) {
      setIsStreamActive(false)
      return
    }

    // Create a branded input ID from the device ID
    const inputId = selectedDevice.id as EMIDIInput.Id

    // Build the message stream with parsing
    const messageStream = pipe(
      EMIDIAccess.makeMessagesStreamByInputId(inputId),
      Parsing.withParsedDataField,
      Stream.filter(
        Predicate.or(Parsing.isNotePress, Parsing.isNoteRelease)
      ),
      Stream.tap((msg) =>
        Effect.sync(() => {
          const payload = msg.midiMessage
          const isOn = payload._tag === "Note Press"
          const noteEvent: MidiNoteEvent = {
            pitch: payload.note as MidiPitch,
            velocity: (isOn ? payload.velocity : 0) as Velocity,
            timestamp: msg.capturedAt.getTime() as Milliseconds,
            on: isOn,
          }
          setLastNote(noteEvent)
          onNoteRef.current?.(noteEvent)
        })
      ),
      Stream.runDrain,
      Effect.provide(EMIDIAccess.layer())
    )

    // Run the stream as a fiber
    const fiber = Effect.runFork(messageStream)
    messageFiberRef.current = fiber
    setIsStreamActive(true)

    return () => {
      // Cleanup: interrupt the fiber
      if (messageFiberRef.current) {
        Effect.runFork(Fiber.interrupt(messageFiberRef.current))
        messageFiberRef.current = null
      }
      setIsStreamActive(false)
    }
  }, [midiAccess, selectedDevice])

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
    isConnected: isStreamActive || simulationMode,
    devices,
    selectedDevice,
    selectDevice,
    lastNote,
    error,
    simulateNote,
    enableSimulation,
  }
}
