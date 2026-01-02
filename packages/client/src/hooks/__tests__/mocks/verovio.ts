/**
 * Mock for Verovio WASM module and toolkit
 *
 * Used methods from useVerovio.ts:
 * - createVerovioModule() -> returns module for VerovioToolkit constructor
 * - VerovioToolkit.setOptions(options)
 * - VerovioToolkit.loadData(xml) -> boolean
 * - VerovioToolkit.getPageCount() -> number
 * - VerovioToolkit.renderToSVG(page) -> string
 * - VerovioToolkit.renderToMIDI() -> string (base64)
 * - VerovioToolkit.getMIDIValuesForElement(id) -> { pitch, time, duration }
 * - VerovioToolkit.getTimeForElement(id) -> number
 * - VerovioToolkit.getPageWithElement(id) -> number
 */

import { mock, type Mock } from "bun:test"

export interface MockVerovioToolkit {
  setOptions: Mock<(options: Record<string, unknown>) => void>
  loadData: Mock<(data: string) => boolean>
  getPageCount: Mock<() => number>
  renderToSVG: Mock<(page: number) => string>
  renderToMIDI: Mock<() => string>
  getMIDIValuesForElement: Mock<
    (id: string) => { pitch: number; time: number; duration: number } | null
  >
  getTimeForElement: Mock<(id: string) => number>
  getPageWithElement: Mock<(id: string) => number>
}

export interface MockVerovioModule {
  _instance: unknown
}

let mockToolkitInstance: MockVerovioToolkit | null = null

export function createMockVerovioToolkit(): MockVerovioToolkit {
  return {
    setOptions: mock(() => {}),
    loadData: mock(() => true),
    getPageCount: mock(() => 1),
    renderToSVG: mock(() => '<svg class="verovio-svg"></svg>'),
    renderToMIDI: mock(() => ""),
    getMIDIValuesForElement: mock(() => ({ pitch: 60, time: 0, duration: 500 })),
    getTimeForElement: mock(() => 0),
    getPageWithElement: mock(() => 1),
  }
}

export function getMockToolkitInstance(): MockVerovioToolkit | null {
  return mockToolkitInstance
}

export function resetMockToolkitInstance(): void {
  mockToolkitInstance = null
}

function setMockToolkitInstance(instance: MockVerovioToolkit): void {
  mockToolkitInstance = instance
}

export const mockCreateVerovioModule = mock(
  (): Promise<MockVerovioModule> => Promise.resolve({ _instance: {} })
)

export class MockVerovioToolkitClass implements MockVerovioToolkit {
  setOptions: Mock<(options: Record<string, unknown>) => void>
  loadData: Mock<(data: string) => boolean>
  getPageCount: Mock<() => number>
  renderToSVG: Mock<(page: number) => string>
  renderToMIDI: Mock<() => string>
  getMIDIValuesForElement: Mock<
    (id: string) => { pitch: number; time: number; duration: number } | null
  >
  getTimeForElement: Mock<(id: string) => number>
  getPageWithElement: Mock<(id: string) => number>

  constructor(_module: MockVerovioModule) {
    const instance = createMockVerovioToolkit()
    this.setOptions = instance.setOptions
    this.loadData = instance.loadData
    this.getPageCount = instance.getPageCount
    this.renderToSVG = instance.renderToSVG
    this.renderToMIDI = instance.renderToMIDI
    this.getMIDIValuesForElement = instance.getMIDIValuesForElement
    this.getTimeForElement = instance.getTimeForElement
    this.getPageWithElement = instance.getPageWithElement
    setMockToolkitInstance(this)
  }
}

/**
 * Apply Verovio mocks to bun:test mock.module
 *
 * Usage:
 * ```ts
 * import { mock } from "bun:test"
 * import { applyVerovioMocks } from "./mocks/verovio"
 *
 * applyVerovioMocks(mock)
 * ```
 */
export function applyVerovioMocks(
  mockModule: typeof mock.module
): { createVerovioModule: typeof mockCreateVerovioModule; VerovioToolkit: typeof MockVerovioToolkitClass } {
  mockModule("verovio/wasm", () => ({
    default: mockCreateVerovioModule,
  }))

  mockModule("verovio/esm", () => ({
    VerovioToolkit: MockVerovioToolkitClass,
  }))

  return {
    createVerovioModule: mockCreateVerovioModule,
    VerovioToolkit: MockVerovioToolkitClass,
  }
}
