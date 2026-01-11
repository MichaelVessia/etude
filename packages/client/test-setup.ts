import { GlobalRegistrator } from "@happy-dom/global-registrator"

GlobalRegistrator.register()

// ===========================================================================
// Global Web MIDI API class mocks for effect-web-midi's instanceof checks
// These MUST be defined before effect-web-midi is imported by any test.
// effect-web-midi checks `globalThis.MIDIInput` at module load time.
// ===========================================================================

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
}

class GlobalMockMIDIOutput extends GlobalMockMIDIPort {
  override readonly type: MIDIPortType = "output"
}

class GlobalMockMIDIAccess {
  inputs: Map<string, GlobalMockMIDIInput> = new Map()
  readonly outputs: MIDIOutputMap = new Map()
  readonly sysexEnabled: boolean = false
  onstatechange:
    | ((this: MIDIAccess, ev: MIDIConnectionEvent) => unknown)
    | null = null

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

// Define global classes for effect-web-midi's instanceof checks
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

Object.defineProperty(globalThis, "MIDIOutput", {
  value: GlobalMockMIDIOutput,
  writable: true,
  configurable: true,
})

Object.defineProperty(globalThis, "MIDIAccess", {
  value: GlobalMockMIDIAccess,
  writable: true,
  configurable: true,
})
