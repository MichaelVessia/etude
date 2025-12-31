declare module "verovio/esm" {
  export interface VerovioToolkit {
    setOptions(options: Record<string, unknown>): void
    loadData(data: string): boolean
    getPageCount(): number
    renderToSVG(page: number): string
    renderToMIDI(): string
    getMIDIValuesForElement(elementId: string): MidiValues
    getTimeForElement(elementId: string): number
    getElementsAtTime(time: number): ElementsAtTime
    getElementAttr(elementId: string): Record<string, string>
    redoLayout(options?: Record<string, unknown>): void
    edit(editorAction: Record<string, unknown>): boolean
  }

  export interface MidiValues {
    pitch: number
    onset: number
    duration: number
  }

  export interface ElementsAtTime {
    notes: string[]
    chords: string[]
  }

  export function createToolkit(): Promise<VerovioToolkit>
}
