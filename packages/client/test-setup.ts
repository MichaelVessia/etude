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
    if (type === "midimessage" && typeof listener === "function") {
      this._messageListeners.push(listener as (event: MIDIMessageEvent) => void)
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
