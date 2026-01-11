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

// ===========================================================================
// Global Web MIDI API class mocks for effect-web-midi's instanceof checks
// ===========================================================================

class GlobalMockMIDIPort {
  readonly id: string = ""
  readonly name: string | null = null
  readonly manufacturer: string | null = null
  readonly version: string | null = null
  readonly state: MIDIPortDeviceState = "connected"
  readonly connection: MIDIPortConnectionState = "closed"
  readonly type: MIDIPortType = "input"
  onstatechange: ((this: MIDIPort, ev: MIDIConnectionEvent) => unknown) | null =
    null

  open(): Promise<MIDIPort> {
    return Promise.resolve(this as unknown as MIDIPort)
  }

  close(): Promise<MIDIPort> {
    return Promise.resolve(this as unknown as MIDIPort)
  }

  addEventListener(): void {}
  removeEventListener(): void {}
  dispatchEvent(): boolean {
    return true
  }
}

class GlobalMockMIDIInput extends GlobalMockMIDIPort {
  override readonly type: MIDIPortType = "input"
  onmidimessage: ((this: MIDIInput, ev: MIDIMessageEvent) => unknown) | null =
    null
}

class GlobalMockMIDIAccess {
  readonly inputs: MIDIInputMap = new Map()
  readonly outputs: MIDIOutputMap = new Map()
  readonly sysexEnabled: boolean = false
  onstatechange:
    | ((this: MIDIAccess, ev: MIDIConnectionEvent) => unknown)
    | null = null

  addEventListener(): void {}
  removeEventListener(): void {}
  dispatchEvent(): boolean {
    return true
  }
}

// Apply global mock classes for effect-web-midi's instanceof checks
Object.defineProperty(globalThis, "MIDIPort", {
  value: GlobalMockMIDIPort,
  writable: true,
  configurable: true,
})

Object.defineProperty(globalThis, "MIDIInput", {
  value: GlobalMockMIDIInput,
  writable: true,
  configurable: true,
})

Object.defineProperty(globalThis, "MIDIAccess", {
  value: GlobalMockMIDIAccess,
  writable: true,
  configurable: true,
})

// ===========================================================================
// Test mock interfaces and state management
// ===========================================================================

export interface TestMIDIInput {
  id: string
  name: string
  manufacturer: string
  onmidimessage: ((event: TestMIDIMessageEvent) => void) | null
}

export interface TestMIDIMessageEvent {
  data: Uint8Array
  timeStamp: number
}

export interface TestMIDIAccess {
  inputs: Map<string, TestMIDIInput>
  onstatechange: (() => void) | null
}

let mockMIDIAccess: TestMIDIAccess | null = null
let mockRequestMIDIAccessFn: Mock<() => Promise<TestMIDIAccess>>

function createMockMIDIInput(
  id: string,
  name: string,
  manufacturer = "Mock Manufacturer"
): TestMIDIInput {
  return {
    id,
    name,
    manufacturer,
    onmidimessage: null,
  }
}

function createMockMIDIAccess(): TestMIDIAccess {
  return {
    inputs: new Map(),
    onstatechange: null,
  }
}

export function getMockMIDIAccess(): TestMIDIAccess | null {
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
): TestMIDIInput {
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
  input: TestMIDIInput,
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
  input: TestMIDIInput,
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
  input: TestMIDIInput,
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
export function getMockRequestMIDIAccess(): Mock<() => Promise<TestMIDIAccess>> {
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
