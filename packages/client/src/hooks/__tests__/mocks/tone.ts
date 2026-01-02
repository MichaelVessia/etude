/**
 * Mock for Tone.js
 *
 * Used from useAudio.ts:
 * - Tone.PolySynth (constructor with Tone.Synth)
 * - Tone.Part (constructor)
 * - Tone.start()
 * - Tone.getContext().state
 * - Tone.getTransport().state / .start() / .pause() / .stop() / .seconds / .bpm.value
 * - synth.toDestination()
 * - synth.triggerAttackRelease(note, duration, time?)
 * - synth.dispose()
 * - part.start(time)
 * - part.dispose()
 */

import { mock, type Mock } from "bun:test"

export interface MockPolySynth {
  toDestination: Mock<() => MockPolySynth>
  triggerAttackRelease: Mock<(note: string, duration: number, time?: number) => void>
  dispose: Mock<() => void>
}

export interface MockPart {
  start: Mock<(time: number) => void>
  dispose: Mock<() => void>
}

export interface MockTransport {
  state: "started" | "stopped" | "paused"
  seconds: number
  bpm: { value: number }
  start: Mock<() => void>
  pause: Mock<() => void>
  stop: Mock<() => void>
}

export interface MockContext {
  state: "running" | "suspended" | "closed"
}

let mockTransport: MockTransport
let mockContext: MockContext
let mockPolySynthInstance: MockPolySynth | null = null
let mockPartInstances: MockPart[] = []

function createMockTransport(): MockTransport {
  return {
    state: "stopped",
    seconds: 0,
    bpm: { value: 120 },
    start: mock(function (this: MockTransport) {
      this.state = "started"
    }),
    pause: mock(function (this: MockTransport) {
      this.state = "paused"
    }),
    stop: mock(function (this: MockTransport) {
      this.state = "stopped"
      this.seconds = 0
    }),
  }
}

function createMockContext(): MockContext {
  return {
    state: "suspended",
  }
}

export function createMockPolySynth(): MockPolySynth {
  const synth: MockPolySynth = {
    toDestination: mock(function (this: MockPolySynth) {
      return this
    }),
    triggerAttackRelease: mock(() => {}),
    dispose: mock(() => {}),
  }
  return synth
}

export function createMockPart(): MockPart {
  return {
    start: mock(() => {}),
    dispose: mock(() => {}),
  }
}

export function getMockPolySynthInstance(): MockPolySynth | null {
  return mockPolySynthInstance
}

export function getMockPartInstances(): MockPart[] {
  return mockPartInstances
}

export function getMockTransport(): MockTransport {
  return mockTransport
}

export function getMockContext(): MockContext {
  return mockContext
}

export function resetToneMocks(): void {
  mockTransport = createMockTransport()
  mockContext = createMockContext()
  mockPolySynthInstance = null
  mockPartInstances = []
}

function setMockPolySynthInstance(instance: MockPolySynth): void {
  mockPolySynthInstance = instance
}

// Initialize mocks
resetToneMocks()

export const MockSynth = {}

export class MockPolySynthClass implements MockPolySynth {
  toDestination: Mock<() => MockPolySynth>
  triggerAttackRelease: Mock<(note: string, duration: number, time?: number) => void>
  dispose: Mock<() => void>

  constructor(_synth?: unknown, _options?: unknown) {
    const instance = createMockPolySynth()
    this.toDestination = instance.toDestination
    this.triggerAttackRelease = instance.triggerAttackRelease
    this.dispose = instance.dispose
    setMockPolySynthInstance(this)
  }
}

export class MockPartClass implements MockPart {
  start: Mock<(time: number) => void>
  dispose: Mock<() => void>

  constructor(_callback?: unknown, _events?: unknown) {
    const instance = createMockPart()
    this.start = instance.start
    this.dispose = instance.dispose
    mockPartInstances.push(this)
  }
}

export const mockToneStart = mock(async (): Promise<void> => {
  mockContext.state = "running"
})

export const mockGetTransport = mock((): MockTransport => mockTransport)

export const mockGetContext = mock((): MockContext => mockContext)

/**
 * Apply Tone.js mocks to bun:test mock.module
 *
 * Usage:
 * ```ts
 * import { mock } from "bun:test"
 * import { applyToneMocks, resetToneMocks } from "./mocks/tone"
 *
 * beforeEach(() => resetToneMocks())
 * applyToneMocks(mock)
 * ```
 */
export function applyToneMocks(mockModule: typeof mock.module): void {
  mockModule("tone", () => ({
    PolySynth: MockPolySynthClass,
    Synth: MockSynth,
    Part: MockPartClass,
    start: mockToneStart,
    getTransport: mockGetTransport,
    getContext: mockGetContext,
  }))
}
