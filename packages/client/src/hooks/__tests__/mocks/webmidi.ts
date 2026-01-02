/**
 * Mock for Web MIDI API (navigator.requestMIDIAccess)
 *
 * Used from useMidi.ts:
 * - navigator.requestMIDIAccess() -> Promise<MIDIAccess>
 * - MIDIAccess.inputs (Map of MIDIInput)
 * - MIDIAccess.onstatechange
 * - MIDIInput.id, .name, .manufacturer
 * - MIDIInput.onmidimessage
 * - MIDIMessageEvent.data (Uint8Array: [status, note, velocity])
 * - MIDIMessageEvent.timeStamp
 */

import { mock, type Mock } from "bun:test"

// MIDI status bytes
const NOTE_ON = 0x90
const NOTE_OFF = 0x80

export interface MockMIDIInput {
  id: string
  name: string
  manufacturer: string
  onmidimessage: ((event: MockMIDIMessageEvent) => void) | null
}

export interface MockMIDIMessageEvent {
  data: Uint8Array
  timeStamp: number
}

export interface MockMIDIAccess {
  inputs: Map<string, MockMIDIInput>
  onstatechange: (() => void) | null
}

let mockMIDIAccess: MockMIDIAccess | null = null
let mockRequestMIDIAccessFn: Mock<() => Promise<MockMIDIAccess>>

function createMockMIDIInput(
  id: string,
  name: string,
  manufacturer = "Mock Manufacturer"
): MockMIDIInput {
  return {
    id,
    name,
    manufacturer,
    onmidimessage: null,
  }
}

function createMockMIDIAccess(): MockMIDIAccess {
  return {
    inputs: new Map(),
    onstatechange: null,
  }
}

export function getMockMIDIAccess(): MockMIDIAccess | null {
  return mockMIDIAccess
}

export function resetWebMidiMocks(): void {
  mockMIDIAccess = createMockMIDIAccess()
  mockRequestMIDIAccessFn = mock(() => Promise.resolve(mockMIDIAccess!))
}

// Initialize
resetWebMidiMocks()

/**
 * Add a mock MIDI input device
 */
export function addMockMIDIInput(
  id: string,
  name: string,
  manufacturer?: string
): MockMIDIInput {
  if (!mockMIDIAccess) {
    throw new Error("Mock MIDI access not initialized")
  }
  const input = createMockMIDIInput(id, name, manufacturer)
  mockMIDIAccess.inputs.set(id, input)
  // Trigger state change if handler is set
  mockMIDIAccess.onstatechange?.()
  return input
}

/**
 * Remove a mock MIDI input device
 */
export function removeMockMIDIInput(id: string): void {
  if (!mockMIDIAccess) return
  mockMIDIAccess.inputs.delete(id)
  mockMIDIAccess.onstatechange?.()
}

/**
 * Simulate a MIDI note on event
 */
export function simulateMIDINoteOn(
  input: MockMIDIInput,
  note: number,
  velocity = 100,
  timestamp = performance.now()
): void {
  if (!input.onmidimessage) return
  input.onmidimessage({
    data: new Uint8Array([NOTE_ON, note, velocity]),
    timeStamp: timestamp,
  })
}

/**
 * Simulate a MIDI note off event
 */
export function simulateMIDINoteOff(
  input: MockMIDIInput,
  note: number,
  velocity = 0,
  timestamp = performance.now()
): void {
  if (!input.onmidimessage) return
  input.onmidimessage({
    data: new Uint8Array([NOTE_OFF, note, velocity]),
    timeStamp: timestamp,
  })
}

/**
 * Simulate a MIDI note on with velocity 0 (alternative note off)
 */
export function simulateMIDINoteOnZeroVelocity(
  input: MockMIDIInput,
  note: number,
  timestamp = performance.now()
): void {
  if (!input.onmidimessage) return
  input.onmidimessage({
    data: new Uint8Array([NOTE_ON, note, 0]),
    timeStamp: timestamp,
  })
}

/**
 * Get the mock requestMIDIAccess function
 */
export function getMockRequestMIDIAccess(): Mock<() => Promise<MockMIDIAccess>> {
  return mockRequestMIDIAccessFn
}

/**
 * Apply Web MIDI mocks to navigator
 *
 * Usage:
 * ```ts
 * import { applyWebMidiMocks, resetWebMidiMocks } from "./mocks/webmidi"
 *
 * beforeEach(() => resetWebMidiMocks())
 * applyWebMidiMocks()
 * ```
 */
export function applyWebMidiMocks(): void {
  Object.defineProperty(navigator, "requestMIDIAccess", {
    value: mockRequestMIDIAccessFn,
    writable: true,
    configurable: true,
  })
}

/**
 * Remove Web MIDI mocks from navigator
 */
export function removeWebMidiMocks(): void {
  // @ts-expect-error - removing mock
  delete navigator.requestMIDIAccess
}
