import { useEffect, useRef, useState, useCallback } from "react"
import createVerovioModule from "verovio/wasm"
import { VerovioToolkit } from "verovio/esm"

export interface VerovioOptions {
  scale?: number
  pageWidth?: number
  pageHeight?: number
  pageMarginTop?: number
  pageMarginBottom?: number
  pageMarginLeft?: number
  pageMarginRight?: number
  svgViewBox?: boolean
  adjustPageHeight?: boolean
  adjustPageWidth?: boolean
}

const defaultOptions: VerovioOptions = {
  scale: 40,
  pageWidth: 2100,
  pageHeight: 2970,
  pageMarginTop: 50,
  pageMarginBottom: 50,
  pageMarginLeft: 50,
  pageMarginRight: 50,
  svgViewBox: true,
  adjustPageHeight: true,
  adjustPageWidth: false,
}

export interface NoteElementInfo {
  elementId: string
  pitch: number
  onset: number // milliseconds from piece start
  duration: number
  page: number // 1-indexed page number
}

export interface UseVerovioResult {
  isReady: boolean
  isLoading: boolean
  error: string | null
  svg: string | null
  pageCount: number
  currentPage: number
  setPage: (page: number) => void
  loadMusicXml: (xml: string) => void
  setOptions: (options: VerovioOptions) => void
  getMidiBase64: () => string | null
  // Note element mapping for visual feedback
  getNoteElements: () => NoteElementInfo[]
  getTimeForElement: (elementId: string) => number | null
  getPageForElement: (elementId: string) => number
}

export function useVerovio(initialOptions?: VerovioOptions): UseVerovioResult {
  const toolkitRef = useRef<VerovioToolkit | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [svg, setSvg] = useState<string | null>(null)
  const [pageCount, setPageCount] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [options, setOptionsState] = useState<VerovioOptions>({
    ...defaultOptions,
    ...initialOptions,
  })
  const initialOptionsRef = useRef(options)

  // Initialize Verovio toolkit
  useEffect(() => {
    let mounted = true

    createVerovioModule()
      .then((module) => {
        if (!mounted) return
        const toolkit = new VerovioToolkit(module)
        toolkitRef.current = toolkit
        toolkit.setOptions(initialOptionsRef.current as Record<string, unknown>)
        setIsReady(true)
        setIsLoading(false)
        setError(null)
      })
      .catch((err: Error) => {
        if (!mounted) return
        setError(`Failed to load Verovio: ${err.message}`)
        setIsLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [])

  // Update options when they change
  useEffect(() => {
    if (toolkitRef.current) {
      toolkitRef.current.setOptions(options as Record<string, unknown>)
    }
  }, [options])

  const loadMusicXml = useCallback((xml: string) => {
    const toolkit = toolkitRef.current
    if (!toolkit) {
      setError("Verovio not ready")
      return
    }

    try {
      const success = toolkit.loadData(xml)
      if (!success) {
        setError("Failed to parse MusicXML")
        return
      }

      const pages = toolkit.getPageCount()
      setPageCount(pages)
      setCurrentPage(1)
      setSvg(toolkit.renderToSVG(1))
      setError(null)
    } catch (err) {
      setError(`Error loading MusicXML: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, [])

  const setPage = useCallback((page: number) => {
    const toolkit = toolkitRef.current
    if (!toolkit || page < 1 || page > pageCount) return

    setCurrentPage(page)
    setSvg(toolkit.renderToSVG(page))
  }, [pageCount])

  const setOptions = useCallback((newOptions: VerovioOptions) => {
    setOptionsState((prev) => ({ ...prev, ...newOptions }))
  }, [])

  const getMidiBase64 = useCallback((): string | null => {
    const toolkit = toolkitRef.current
    if (!toolkit) return null

    try {
      return toolkit.renderToMIDI()
    } catch {
      return null
    }
  }, [])

  // Get all note elements with their MIDI values
  // Parses the SVG to find note IDs and queries Verovio for timing info
  const getNoteElements = useCallback((): NoteElementInfo[] => {
    const toolkit = toolkitRef.current
    if (!toolkit || !svg) {
      console.log("[Verovio] getNoteElements: toolkit or svg not ready")
      return []
    }

    try {
      // Must render MIDI before querying MIDI values
      toolkit.renderToMIDI()

      // Parse SVG to find all note elements (they have class "note")
      const parser = new DOMParser()
      const doc = parser.parseFromString(svg, "image/svg+xml")
      const noteElements = doc.querySelectorAll(".note")
      console.log("[Verovio] Found", noteElements.length, "note elements in SVG")

      const notes: NoteElementInfo[] = []
      noteElements.forEach((el) => {
        const elementId = el.id
        if (!elementId) return // Skip elements without IDs
        try {
          const midiValues = toolkit.getMIDIValuesForElement(elementId)
          // Debug: log first few values to see actual property names
          if (notes.length < 3) {
            console.log("[Verovio] MIDI values for", elementId, ":", JSON.stringify(midiValues))
          }
          if (midiValues && midiValues.pitch !== undefined) {
            // Get page number for this element
            let page = 1
            try {
              page = toolkit.getPageWithElement(elementId)
            } catch {
              // Default to page 1 if can't determine
            }
            notes.push({
              elementId,
              pitch: midiValues.pitch,
              onset: midiValues.time,
              duration: midiValues.duration,
              page,
            })
          }
        } catch {
          // Element might not have MIDI values (e.g., rest)
        }
      })

      console.log("[Verovio] Returning", notes.length, "notes with MIDI values")
      return notes
    } catch (e) {
      console.error("[Verovio] Error in getNoteElements:", e)
      return []
    }
  }, [svg])

  // Get time for a specific element
  const getTimeForElement = useCallback((elementId: string): number | null => {
    const toolkit = toolkitRef.current
    if (!toolkit) return null

    try {
      return toolkit.getTimeForElement(elementId)
    } catch {
      return null
    }
  }, [])

  // Get page number for a specific element (1-indexed)
  const getPageForElement = useCallback((elementId: string): number => {
    const toolkit = toolkitRef.current
    if (!toolkit) return 1

    try {
      return toolkit.getPageWithElement(elementId)
    } catch {
      return 1
    }
  }, [])

  return {
    isReady,
    isLoading,
    error,
    svg,
    pageCount,
    currentPage,
    setPage,
    loadMusicXml,
    setOptions,
    getMidiBase64,
    getNoteElements,
    getTimeForElement,
    getPageForElement,
  }
}
