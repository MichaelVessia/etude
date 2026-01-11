import { GlobalRegistrator } from "@happy-dom/global-registrator"

GlobalRegistrator.register()

// ===========================================================================
// Global Web MIDI API class mocks for effect-web-midi's instanceof checks
// These MUST be defined before effect-web-midi is imported by any test.
// effect-web-midi checks `globalThis.MIDIInput` at module load time.
//
// IMPORTANT: These classes must have the FULL implementation because
// effect-web-midi captures a reference at load time. The mock in webmidi.ts
// uses these classes, so they must support addEventListener, etc.
// ===========================================================================

class GlobalMockMIDIPort extends EventTarget {
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
}

class GlobalMockMIDIInput extends GlobalMockMIDIPort {
  override readonly type: MIDIPortType = "input"
  private _onmidimessage:
    | ((this: MIDIInput, ev: MIDIMessageEvent) => unknown)
    | null = null
  private _messageListenerCount = 0
  private _listenerAddedResolvers: Array<() => void> = []

  get onmidimessage(): ((this: MIDIInput, ev: MIDIMessageEvent) => unknown) | null {
    return this._onmidimessage
  }

  set onmidimessage(
    value: ((this: MIDIInput, ev: MIDIMessageEvent) => unknown) | null
  ) {
    this._onmidimessage = value
    if (value !== null) {
      this._notifyListenerAdded()
    }
  }

  private _notifyListenerAdded(): void {
    for (const resolve of this._listenerAddedResolvers) {
      resolve()
    }
    this._listenerAddedResolvers = []
  }

  override addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions
  ): void {
    super.addEventListener(type, listener, options)
    if (type === "midimessage" && listener !== null) {
      this._messageListenerCount++
      this._notifyListenerAdded()
    }
  }

  override removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions
  ): void {
    super.removeEventListener(type, listener, options)
    if (type === "midimessage" && listener !== null) {
      this._messageListenerCount = Math.max(0, this._messageListenerCount - 1)
    }
  }

  hasMessageListener(): boolean {
    return this._messageListenerCount > 0 || this._onmidimessage !== null
  }

  waitForMessageListener(): Promise<void> {
    if (this.hasMessageListener()) {
      return Promise.resolve()
    }
    return new Promise((resolve) => {
      this._listenerAddedResolvers.push(resolve)
    })
  }

  dispatchMidiMessage(event: MIDIMessageEvent): void {
    const midiEvent = new Event("midimessage")
    Object.defineProperty(midiEvent, "data", { value: event.data })
    Object.defineProperty(midiEvent, "timeStamp", { value: event.timeStamp })
    this.dispatchEvent(midiEvent)
    this.onmidimessage?.call(this as unknown as MIDIInput, midiEvent as MIDIMessageEvent)
  }
}

class GlobalMockMIDIOutput extends GlobalMockMIDIPort {
  override readonly type: MIDIPortType = "output"
}

class GlobalMockMIDIAccess extends EventTarget {
  inputs: Map<string, GlobalMockMIDIInput> = new Map()
  readonly outputs: MIDIOutputMap = new Map()
  readonly sysexEnabled: boolean = false
  onstatechange:
    | ((this: MIDIAccess, ev: MIDIConnectionEvent) => unknown)
    | null = null

  dispatchStateChange(port: GlobalMockMIDIInput | null): void {
    const event = new Event("statechange")
    Object.defineProperty(event, "port", { value: port as unknown as MIDIPort })
    this.dispatchEvent(event)
    this.onstatechange?.call(this as unknown as MIDIAccess, event as MIDIConnectionEvent)
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
