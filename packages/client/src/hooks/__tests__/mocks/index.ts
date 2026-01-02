/**
 * Test mock infrastructure for client hooks
 *
 * Usage example:
 * ```ts
 * import { describe, test, expect, beforeEach, mock } from "bun:test"
 * import {
 *   applyVerovioMocks,
 *   getMockToolkitInstance,
 *   resetMockToolkitInstance,
 * } from "./mocks"
 *
 * applyVerovioMocks(mock.module)
 *
 * describe("useVerovio", () => {
 *   beforeEach(() => resetMockToolkitInstance())
 *   // ...tests
 * })
 * ```
 */

export {
  applyVerovioMocks,
  createMockVerovioToolkit,
  getMockToolkitInstance,
  resetMockToolkitInstance,
  mockCreateVerovioModule,
  MockVerovioToolkitClass,
  type MockVerovioToolkit,
  type MockVerovioModule,
} from "./verovio"

export {
  applyToneMocks,
  resetToneMocks,
  createMockPolySynth,
  createMockPart,
  getMockPolySynthInstance,
  getMockPartInstances,
  getMockTransport,
  getMockContext,
  MockPolySynthClass,
  MockPartClass,
  mockToneStart,
  mockGetTransport,
  mockGetContext,
  type MockPolySynth,
  type MockPart,
  type MockTransport,
  type MockContext,
} from "./tone"

export {
  applyWebMidiMocks,
  removeWebMidiMocks,
  resetWebMidiMocks,
  getMockMIDIAccess,
  getMockRequestMIDIAccess,
  addMockMIDIInput,
  removeMockMIDIInput,
  simulateMIDINoteOn,
  simulateMIDINoteOff,
  simulateMIDINoteOnZeroVelocity,
  type MockMIDIInput,
  type MockMIDIMessageEvent,
  type MockMIDIAccess,
} from "./webmidi"
