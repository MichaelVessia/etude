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
// These classes are used both as global prototypes and as bases for test mocks
// ===========================================================================

// Store event listeners for state change stream
type StateChangeListener = (event: MIDIConnectionEvent) => void

class GlobalMockMIDIPort {
  id = ""
  name: string | null = null
  manufacturer: string | null = null
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

  addEventListener(
    _type: string,
    _listener: EventListenerOrEventListenerObject
  ): void {}
  removeEventListener(
    _type: string,
    _listener: EventListenerOrEventListenerObject
  ): void {}
  dispatchEvent(): boolean {
    return true
  }
}

class GlobalMockMIDIInput extends GlobalMockMIDIPort {
  override readonly type: MIDIPortType = "input"
  private _onmidimessage:
    | ((this: MIDIInput, ev: MIDIMessageEvent) => unknown)
    | null = null
  private _messageListeners: Array<(event: MIDIMessageEvent) => void> = []
  private _listenerAddedResolvers: Array<() => void> = []

  // Use getter/setter so we can notify when onmidimessage is set
  get onmidimessage(): ((this: MIDIInput, ev: MIDIMessageEvent) => unknown) | null {
    return this._onmidimessage
  }

  set onmidimessage(
    value: ((this: MIDIInput, ev: MIDIMessageEvent) => unknown) | null
  ) {
    this._onmidimessage = value
    if (value !== null) {
      // Notify any waiters that a listener was added
      for (const resolve of this._listenerAddedResolvers) {
        resolve()
      }
      this._listenerAddedResolvers = []
    }
  }

  override addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject
  ): void {
    console.log(`[MIDI Mock] addEventListener called: type=${type}, listenerType=${typeof listener}`)
    if (type === "midimessage" && typeof listener === "function") {
      this._messageListeners.push(listener as (event: MIDIMessageEvent) => void)
      console.log(`[MIDI Mock] Listener added, count=${this._messageListeners.length}`)
      // Notify any waiters that a listener was added
      for (const resolve of this._listenerAddedResolvers) {
        resolve()
      }
      this._listenerAddedResolvers = []
    }
  }

  /**
   * Synchronously checks if a midimessage listener is registered.
   * Use this in waitFor() to check listener readiness alongside other conditions.
   */
  hasMessageListener(): boolean {
    return this._messageListeners.length > 0 || this._onmidimessage !== null
  }

  /**
   * Returns a promise that resolves when a midimessage listener is added
   * (via addEventListener or onmidimessage setter).
   * Use this in tests to wait for the stream to be ready.
   */
  waitForMessageListener(): Promise<void> {
    if (this._messageListeners.length > 0 || this._onmidimessage !== null) {
      return Promise.resolve()
    }
    return new Promise((resolve) => {
      this._listenerAddedResolvers.push(resolve)
    })
  }

  override removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject
  ): void {
    if (type === "midimessage" && typeof listener === "function") {
      const idx = this._messageListeners.indexOf(
        listener as (event: MIDIMessageEvent) => void
      )
      if (idx >= 0) this._messageListeners.splice(idx, 1)
    }
  }

  dispatchMidiMessage(event: MIDIMessageEvent): void {
    for (const listener of this._messageListeners) {
      listener(event)
    }
    this.onmidimessage?.call(this as unknown as MIDIInput, event)
  }
}

class GlobalMockMIDIAccess {
  inputs: Map<string, GlobalMockMIDIInput> = new Map()
  readonly outputs: MIDIOutputMap = new Map()
  readonly sysexEnabled: boolean = false
  onstatechange:
    | ((this: MIDIAccess, ev: MIDIConnectionEvent) => unknown)
    | null = null
  private _stateChangeListeners: StateChangeListener[] = []

  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject
  ): void {
    if (type === "statechange" && typeof listener === "function") {
      this._stateChangeListeners.push(listener as StateChangeListener)
    }
  }

  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject
  ): void {
    if (type === "statechange" && typeof listener === "function") {
      const idx = this._stateChangeListeners.indexOf(
        listener as StateChangeListener
      )
      if (idx >= 0) this._stateChangeListeners.splice(idx, 1)
    }
  }

  dispatchEvent(): boolean {
    return true
  }

  dispatchStateChange(port: GlobalMockMIDIInput | null): void {
    const event = {
      port: port as unknown as MIDIPort,
    } as MIDIConnectionEvent
    for (const listener of this._stateChangeListeners) {
      listener(event)
    }
    this.onstatechange?.call(this as unknown as MIDIAccess, event)
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
  const input = new GlobalMockMIDIInput()
  input.id = id
  input.name = name
  input.manufacturer = manufacturer
  return input
}

function createMockMIDIAccess(): GlobalMockMIDIAccess {
  return new GlobalMockMIDIAccess()
}

export function getMockMIDIAccess(): TestMIDIAccess | null {
  return mockMIDIAccess
}

export function resetWebMidiMocks(): void {
  mockMIDIAccess = createMockMIDIAccess()
  mockRequestMIDIAccessFn = mock(() => {
    console.log(`[MIDI Mock] requestMIDIAccess called, inputs count=${mockMIDIAccess?.inputs.size}`)
    return Promise.resolve(mockMIDIAccess!)
  })
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
