# Task: Integrate effect-web-midi Library

## Problem

`useMidi.ts` uses raw Web MIDI API with:
- Manual event subscription/cleanup
- No typed error handling
- localStorage access without safety
- Untestable due to browser API coupling
- Device lifecycle managed imperatively

## Current State

```typescript
// packages/client/src/hooks/useMidi.ts

// Manual device enumeration
const inputs = midiAccess.inputs.values()
for (const input of inputs) {
  if (input.id === selectedId) {
    input.onmidimessage = handleMidiMessage
  }
}

// Manual cleanup scattered across useEffect
return () => {
  for (const input of midiAccessRef.current.inputs.values()) {
    input.onmidimessage = null
  }
}

// Unprotected localStorage
try {
  const saved = localStorage.getItem(MIDI_DEVICE_KEY)
  if (saved) setSelectedDeviceId(saved)
} catch { /* silent */ }
```

## Proposed Solution

Use the `effect-web-midi` library which provides:
- Effect-wrapped MIDI access with typed errors
- Stream-based message handling
- Automatic MIDI message parsing (NotePress, NoteRelease, ControlChange, etc.)
- Branded port IDs for type safety
- Layer-based dependency injection
- Built-in device state change streams

### Library Features

```typescript
import * as EMIDIAccess from 'effect-web-midi/EMIDIAccess'
import * as EMIDIInput from 'effect-web-midi/EMIDIInput'
import * as EMIDIOutput from 'effect-web-midi/EMIDIOutput'
import * as EMIDIPort from 'effect-web-midi/EMIDIPort'
import * as Parsing from 'effect-web-midi/Parsing'

// Typed errors:
// - AbortError
// - UnderlyingSystemError
// - MIDIAccessNotSupportedError
// - MIDIAccessNotAllowedError
// - PortNotFoundError

// Request access
EMIDIAccess.request()
// => Effect<EMIDIAccessInstance, AccessErrors, never>

// List all ports
EMIDIPort.FullRecord
// => Effect<{ [id]: EMIDIPort }, never, EMIDIAccess>

// Stream messages from input
EMIDIInput.makeMessagesStreamById(inputId)
// => Stream<MIDIMessage, PortNotFoundError, EMIDIAccess>

// Parse raw messages to typed events
Parsing.withParsedDataField
// => Transforms stream to ParsedMIDIMessage with NotePress | NoteRelease | ControlChange | etc.

// Device connection changes
EMIDIAccess.makeAllPortsStateChangesStream()
// => Stream<MIDIPortStateChange, AccessErrors, never>
```

## Implementation Steps

### 1. Install effect-web-midi

```bash
bun add effect-web-midi
```

### 2. Create localStorage Effect wrapper (still needed)

```typescript
// packages/client/src/services/storage.ts

import { Context, Effect, Layer } from "effect"

export class StorageService extends Context.Tag("StorageService")<
  StorageService,
  {
    readonly get: (key: string) => Effect.Effect<string | null>
    readonly set: (key: string, value: string) => Effect.Effect<void>
    readonly remove: (key: string) => Effect.Effect<void>
  }
>() {}

export const StorageServiceLive = Layer.succeed(
  StorageService,
  StorageService.of({
    get: (key) => Effect.sync(() => localStorage.getItem(key)),
    set: (key, value) => Effect.sync(() => localStorage.setItem(key, value)),
    remove: (key) => Effect.sync(() => localStorage.removeItem(key)),
  })
)
```

### 3. Refactor useMidi hook

```typescript
// packages/client/src/hooks/useMidi.ts (refactored)

import { pipe } from "effect/Function"
import * as Effect from "effect/Effect"
import * as Stream from "effect/Stream"
import * as EMIDIAccess from "effect-web-midi/EMIDIAccess"
import * as EMIDIInput from "effect-web-midi/EMIDIInput"
import * as EMIDIPort from "effect-web-midi/EMIDIPort"
import * as Parsing from "effect-web-midi/Parsing"

interface MidiDevice {
  readonly id: string
  readonly name: string
  readonly manufacturer: string
}

export function useMidi(onNote: (note: MidiNote) => void) {
  const [devices, setDevices] = useState<MidiDevice[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // List available input devices
  useEffect(() => {
    const program = pipe(
      EMIDIPort.FullRecord,
      Effect.map((ports) =>
        Object.values(ports)
          .filter((p): p is EMIDIInput.EMIDIInput => p.type === "input")
          .map((p) => ({
            id: p.id,
            name: p.name ?? "Unknown",
            manufacturer: p.manufacturer ?? "Unknown",
          }))
      ),
      Effect.provide(EMIDIAccess.layerDefault)
    )

    Effect.runPromise(program)
      .then(setDevices)
      .catch((e) => setError(String(e)))
  }, [])

  // Subscribe to selected device messages
  useEffect(() => {
    if (!selectedId) return

    const inputId = EMIDIInput.Id(selectedId)

    const program = pipe(
      EMIDIInput.makeMessagesStreamById(inputId),
      Parsing.withParsedDataField,
      Stream.runForEach((msg) =>
        Effect.sync(() => {
          if (msg.midiMessage._tag === "Note Press") {
            onNote({
              pitch: msg.midiMessage.note,
              velocity: msg.midiMessage.velocity,
              on: true,
            })
          } else if (msg.midiMessage._tag === "Note Release") {
            onNote({
              pitch: msg.midiMessage.note,
              velocity: msg.midiMessage.velocity,
              on: false,
            })
          }
        })
      ),
      Effect.provide(EMIDIAccess.layerDefault)
    )

    const fiber = Effect.runFork(program)
    return () => Effect.runFork(Fiber.interrupt(fiber))
  }, [selectedId, onNote])

  return { devices, selectedId, setSelectedId, error }
}
```

### 4. Optional: Device hot-plug support

```typescript
// Watch for device connections/disconnections
const deviceChanges = pipe(
  EMIDIAccess.request(),
  EMIDIAccess.makeAllPortsStateChangesStream(),
  Stream.runForEach((change) =>
    Effect.sync(() => {
      // Refresh device list on connect/disconnect
      if (change.newState.ofDevice === "connected") {
        // Add device
      } else if (change.newState.ofDevice === "disconnected") {
        // Remove device
      }
    })
  )
)
```

## Files to Create/Modify

| File | Action |
|------|--------|
| `packages/client/package.json` | Add effect-web-midi dependency |
| `packages/client/src/services/storage.ts` | Create (localStorage wrapper) |
| `packages/client/src/hooks/useMidi.ts` | Refactor to use effect-web-midi |

## Testing Approach

The library's layer-based DI allows test mocking. Create a test layer:

```typescript
import { Layer } from "effect"
import * as EMIDIAccess from "effect-web-midi/EMIDIAccess"

// Mock implementation for tests
export const EMIDIAccessTest = Layer.succeed(
  EMIDIAccess.EMIDIAccess,
  {
    // Mock access instance
  }
)
```

## Success Criteria

- [ ] effect-web-midi installed
- [ ] useMidi refactored to use library streams
- [ ] Typed MIDI messages (NotePress, NoteRelease) handled
- [ ] StorageService for localStorage access
- [ ] Device hot-plug events handled (optional)
- [ ] Tests pass with mock layer

## Scope

- ~100-150 lines of new/modified code (significantly reduced from original estimate)
- Library handles all Web MIDI complexity
