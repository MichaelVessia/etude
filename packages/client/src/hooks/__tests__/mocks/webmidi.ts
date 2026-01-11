/**
 * Mock for Web MIDI API (navigator.requestMIDIAccess)
 *
 * Uses the global MIDI classes defined in test-setup.ts which are set up
 * before effect-web-midi loads. This ensures instanceof checks work correctly.
 *
 * effect-web-midi uses Stream.fromEventListener (addEventListener) internally,
 * not onmidimessage/onstatechange properties. Our mocks extend EventTarget
 * to support this pattern.
 *
 * Used from useMidi.ts via effect-web-midi:
 * - navigator.requestMIDIAccess() -> Promise<MIDIAccess>
 * - MIDIAccess.inputs (Map of MIDIInput)
 * - MIDIInput.id, .name, .manufacturer
 * - MIDIInput.addEventListener("midimessage", ...)
 * - MIDIAccess.addEventListener("statechange", ...)
 * - MIDIMessageEvent.data (Uint8Array: [status, note, velocity])
 * - MIDIMessageEvent.timeStamp
 */

import { mock, type Mock } from "bun:test"

// MIDI status bytes
const NOTE_ON = 0x90
const NOTE_OFF = 0x80

// ===========================================================================
// Type definitions for the global mock classes defined in test-setup.ts
// These match the implementations in test-setup.ts
// ===========================================================================

interface GlobalMockMIDIInput extends MIDIInput {
  hasMessageListener(): boolean
  waitForMessageListener(): Promise<void>
  dispatchMidiMessage(event: MIDIMessageEvent): void
}

interface GlobalMockMIDIAccess extends MIDIAccess {
  inputs: Map<string, GlobalMockMIDIInput>
  dispatchStateChange(port: GlobalMockMIDIInput | null): void
}

// Get the global mock classes (defined in test-setup.ts)
const GlobalMIDIInput = globalThis.MIDIInput as new () => GlobalMockMIDIInput
const GlobalMIDIAccess = globalThis.MIDIAccess as new () => GlobalMockMIDIAccess

// ===========================================================================
// Test mock interfaces and state management
// ===========================================================================

// Export the mock input type for tests
export type TestMIDIInput = GlobalMockMIDIInput

export interface TestMIDIMessageEvent {
  data: Uint8Array
  timeStamp: number
}

// Export the mock access type for tests
export type TestMIDIAccess = GlobalMockMIDIAccess

let mockMIDIAccess: GlobalMockMIDIAccess | null = null
let mockRequestMIDIAccessFn: Mock<() => Promise<GlobalMockMIDIAccess>>

function createMockMIDIInput(
  id: string,
  name: string,
  manufacturer = "Mock Manufacturer"
): GlobalMockMIDIInput {
  const input = new GlobalMIDIInput()
  // Use Object.defineProperty to set readonly properties
  Object.defineProperty(input, "id", { value: id, writable: true })
  Object.defineProperty(input, "name", { value: name, writable: true })
  Object.defineProperty(input, "manufacturer", { value: manufacturer, writable: true })
  return input
}

function createMockMIDIAccess(): GlobalMockMIDIAccess {
  return new GlobalMIDIAccess()
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
  // Trigger state change event for effect-web-midi streams
  mockMIDIAccess.dispatchStateChange(input)
  return input
}

/**
 * Remove a mock MIDI input device
 */
export function removeMockMIDIInput(id: string): void {
  if (!mockMIDIAccess) return
  const input = mockMIDIAccess.inputs.get(id)
  mockMIDIAccess.inputs.delete(id)
  // Trigger state change event for effect-web-midi streams
  mockMIDIAccess.dispatchStateChange(input ?? null)
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
  const event = {
    data: new Uint8Array([NOTE_ON, note, velocity]),
    timeStamp: timestamp,
  } as MIDIMessageEvent
  input.dispatchMidiMessage(event)
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
  const event = {
    data: new Uint8Array([NOTE_OFF, note, velocity]),
    timeStamp: timestamp,
  } as MIDIMessageEvent
  input.dispatchMidiMessage(event)
}

/**
 * Simulate a MIDI note on with velocity 0 (alternative note off)
 */
export function simulateMIDINoteOnZeroVelocity(
  input: TestMIDIInput,
  note: number,
  timestamp = performance.now()
): void {
  const event = {
    data: new Uint8Array([NOTE_ON, note, 0]),
    timeStamp: timestamp,
  } as MIDIMessageEvent
  input.dispatchMidiMessage(event)
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
