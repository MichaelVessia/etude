declare module "verovio/wasm" {
  export interface VerovioModule {
    cwrap(
      name: string,
      returnType: string | null,
      argTypes: string[]
    ): (...args: unknown[]) => unknown
    _malloc(size: number): number
    _free(ptr: number): void
    HEAPU8: Uint8Array
  }

  export default function createVerovioModule(): Promise<VerovioModule>
}

declare module "verovio/esm" {
  import type { VerovioModule } from "verovio/wasm"

  export interface MidiValues {
    pitch: number
    onset: number
    duration: number
  }

  export interface ElementsAtTime {
    notes: string[]
    chords: string[]
  }

  export class VerovioToolkit {
    constructor(module: VerovioModule)
    destroy(): void
    setOptions(options: Record<string, unknown>): void
    loadData(data: string): boolean
    getPageCount(): number
    renderToSVG(page?: number, xmlDeclaration?: boolean): string
    renderToMIDI(): string
    getMIDIValuesForElement(elementId: string): MidiValues
    getTimeForElement(elementId: string): number
    getElementsAtTime(time: number): ElementsAtTime
    getElementAttr(elementId: string): Record<string, string>
    redoLayout(options?: Record<string, unknown>): void
    edit(editorAction: Record<string, unknown>): boolean
  }

  export const LOG_OFF: number
  export const LOG_ERROR: number
  export const LOG_WARNING: number
  export const LOG_INFO: number
  export const LOG_DEBUG: number
  export function enableLog(level: number, module: VerovioModule): void
  export function enableLogToBuffer(value: number, module: VerovioModule): void
}
