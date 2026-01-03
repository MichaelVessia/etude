import { describe, expect, it, mock, beforeEach, afterEach } from "bun:test"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"
import { PracticeControls } from "../PracticeControls.js"
import type { Hand } from "../../hooks/useSession.js"

// Mock the useAudio hook
const mockAudio = {
  isReady: true,
  isPlaying: false,
  loadMidi: mock(() => {}),
  play: mock(() => {}),
  pause: mock(() => {}),
  stop: mock(() => {}),
}

mock.module("../../hooks/index.js", () => ({
  useAudio: () => mockAudio,
}))

interface PracticeControlsProps {
  isActive?: boolean
  isLoading?: boolean
  isMidiConnected?: boolean
  tempo?: number
  onTempoChange?: (tempo: number) => void
  selectedHand?: Hand
  onHandChange?: (hand: Hand) => void
  measureStart?: number
  measureEnd?: number
  maxMeasure?: number
  onMeasureStartChange?: (measure: number) => void
  onMeasureEndChange?: (measure: number) => void
  onStart?: () => void
  onStop?: () => void
  midiBase64?: string | null
  sessionStats?: {
    playedNotes: number
    expectedNotes: number
    matchedNotes: number
  }
}

function renderPracticeControls(overrides: PracticeControlsProps = {}) {
  const defaultProps = {
    isActive: false,
    isLoading: false,
    isMidiConnected: true,
    tempo: 100,
    onTempoChange: mock(() => {}),
    selectedHand: "both" as Hand,
    onHandChange: mock(() => {}),
    measureStart: 1,
    measureEnd: 4,
    maxMeasure: 8,
    onMeasureStartChange: mock(() => {}),
    onMeasureEndChange: mock(() => {}),
    onStart: mock(() => {}),
    onStop: mock(() => {}),
    midiBase64: "base64data",
    sessionStats: undefined,
  }

  const props = { ...defaultProps, ...overrides }
  return { ...render(<PracticeControls {...props} />), props }
}

describe("PracticeControls", () => {
  beforeEach(() => {
    mockAudio.isPlaying = false
    mockAudio.loadMidi.mockClear()
    mockAudio.play.mockClear()
    mockAudio.pause.mockClear()
    mockAudio.stop.mockClear()
  })

  afterEach(() => {
    cleanup()
  })

  describe("rendering", () => {
    it("renders Listen section", () => {
      renderPracticeControls()

      expect(screen.getByText("Listen")).toBeTruthy()
    })

    it("renders Tempo control", () => {
      renderPracticeControls()

      expect(screen.getByText("Tempo")).toBeTruthy()
      expect(screen.getByText("100%")).toBeTruthy()
    })

    it("renders Hand selection", () => {
      renderPracticeControls()

      expect(screen.getByText("Hand")).toBeTruthy()
      expect(screen.getByText("L")).toBeTruthy()
      expect(screen.getByText("Both")).toBeTruthy()
      expect(screen.getByText("R")).toBeTruthy()
    })

    it("renders Measures control", () => {
      renderPracticeControls()

      expect(screen.getByText("Measures")).toBeTruthy()
    })

    it("renders Start Practice button when not active", () => {
      renderPracticeControls({ isActive: false })

      expect(screen.getByText("Start Practice")).toBeTruthy()
    })

    it("renders End Practice button when active", () => {
      renderPracticeControls({ isActive: true })

      expect(screen.getByText("End Practice")).toBeTruthy()
    })
  })

  describe("MIDI warning", () => {
    it("shows warning when MIDI not connected", () => {
      renderPracticeControls({ isMidiConnected: false })

      expect(screen.getByText("Connect a MIDI device to start practicing")).toBeTruthy()
    })

    it("hides warning when MIDI connected", () => {
      renderPracticeControls({ isMidiConnected: true })

      expect(screen.queryByText("Connect a MIDI device to start practicing")).toBeNull()
    })
  })

  describe("loading states", () => {
    it("shows Starting... when loading and not active", () => {
      renderPracticeControls({ isLoading: true, isActive: false })

      expect(screen.getByText("Starting...")).toBeTruthy()
    })

    it("shows Ending... when loading and active", () => {
      renderPracticeControls({ isLoading: true, isActive: true })

      expect(screen.getByText("Ending...")).toBeTruthy()
    })
  })

  describe("session stats", () => {
    it("shows stats when active with sessionStats", () => {
      renderPracticeControls({
        isActive: true,
        sessionStats: {
          playedNotes: 10,
          expectedNotes: 20,
          matchedNotes: 8,
        },
      })

      expect(screen.getByText("8")).toBeTruthy()
      expect(screen.getByText("Matched")).toBeTruthy()
      expect(screen.getByText("10")).toBeTruthy()
      expect(screen.getByText("Played")).toBeTruthy()
      expect(screen.getByText("20")).toBeTruthy()
      expect(screen.getByText("Expected")).toBeTruthy()
    })

    it("hides stats when not active", () => {
      renderPracticeControls({
        isActive: false,
        sessionStats: {
          playedNotes: 10,
          expectedNotes: 20,
          matchedNotes: 8,
        },
      })

      expect(screen.queryByText("Matched")).toBeNull()
      expect(screen.queryByText("Played")).toBeNull()
      expect(screen.queryByText("Expected")).toBeNull()
    })
  })

  describe("Start/Stop button", () => {
    it("disables start when MIDI not connected", () => {
      renderPracticeControls({ isMidiConnected: false })

      const button = screen.getByText("Start Practice")
      expect((button as HTMLButtonElement).disabled).toBe(true)
    })

    it("disables start when no MIDI data", () => {
      renderPracticeControls({ midiBase64: null })

      const button = screen.getByText("Start Practice")
      expect((button as HTMLButtonElement).disabled).toBe(true)
    })

    it("disables start when loading", () => {
      renderPracticeControls({ isLoading: true })

      const button = screen.getByText("Starting...")
      expect((button as HTMLButtonElement).disabled).toBe(true)
    })

    it("enables start when MIDI connected and data available", () => {
      renderPracticeControls({ isMidiConnected: true, midiBase64: "data" })

      const button = screen.getByText("Start Practice")
      expect((button as HTMLButtonElement).disabled).toBe(false)
    })

    it("calls onStart when Start Practice clicked", () => {
      const onStart = mock(() => {})
      renderPracticeControls({ onStart })

      fireEvent.click(screen.getByText("Start Practice"))

      expect(onStart).toHaveBeenCalledTimes(1)
    })

    it("calls onStop when End Practice clicked", () => {
      const onStop = mock(() => {})
      renderPracticeControls({ isActive: true, onStop })

      fireEvent.click(screen.getByText("End Practice"))

      expect(onStop).toHaveBeenCalledTimes(1)
    })
  })

  describe("tempo control", () => {
    it("calls onTempoChange when slider changed", () => {
      const onTempoChange = mock(() => {})
      renderPracticeControls({ onTempoChange, tempo: 100 })

      const slider = screen.getByRole("slider")
      fireEvent.change(slider, { target: { value: "75" } })

      expect(onTempoChange).toHaveBeenCalledWith(75)
    })

    it("disables tempo slider when active", () => {
      renderPracticeControls({ isActive: true })

      const slider = screen.getByRole("slider")
      expect((slider as HTMLInputElement).disabled).toBe(true)
    })
  })

  describe("hand selection", () => {
    it("calls onHandChange when hand button clicked", () => {
      const onHandChange = mock(() => {})
      renderPracticeControls({ onHandChange })

      fireEvent.click(screen.getByText("L"))

      expect(onHandChange).toHaveBeenCalledWith("left")
    })

    it("calls onHandChange for right hand", () => {
      const onHandChange = mock(() => {})
      renderPracticeControls({ onHandChange })

      fireEvent.click(screen.getByText("R"))

      expect(onHandChange).toHaveBeenCalledWith("right")
    })

    it("disables hand buttons when active", () => {
      renderPracticeControls({ isActive: true })

      const leftButton = screen.getByText("L")
      expect((leftButton as HTMLButtonElement).disabled).toBe(true)
    })
  })

  describe("measure controls", () => {
    it("renders measure start and end inputs", () => {
      renderPracticeControls({ measureStart: 1, measureEnd: 4 })

      const inputs = screen.getAllByRole("spinbutton")
      expect(inputs.length).toBe(2)
      expect((inputs[0] as HTMLInputElement).value).toBe("1")
      expect((inputs[1] as HTMLInputElement).value).toBe("4")
    })

    it("calls onMeasureStartChange when start input changed", () => {
      const onMeasureStartChange = mock(() => {})
      renderPracticeControls({ onMeasureStartChange, measureStart: 1, measureEnd: 4 })

      const inputs = screen.getAllByRole("spinbutton")
      fireEvent.change(inputs[0], { target: { value: "2" } })

      expect(onMeasureStartChange).toHaveBeenCalled()
    })

    it("calls onMeasureEndChange when end input changed", () => {
      const onMeasureEndChange = mock(() => {})
      renderPracticeControls({ onMeasureEndChange, measureStart: 1, measureEnd: 4 })

      const inputs = screen.getAllByRole("spinbutton")
      fireEvent.change(inputs[1], { target: { value: "6" } })

      expect(onMeasureEndChange).toHaveBeenCalled()
    })

    it("disables measure inputs when active", () => {
      renderPracticeControls({ isActive: true })

      const inputs = screen.getAllByRole("spinbutton")
      expect((inputs[0] as HTMLInputElement).disabled).toBe(true)
      expect((inputs[1] as HTMLInputElement).disabled).toBe(true)
    })
  })

  describe("playback controls", () => {
    it("shows play button when not playing", () => {
      mockAudio.isPlaying = false
      renderPracticeControls()

      // Play button should be visible (it has a Play title)
      const playButton = screen.getByTitle("Play")
      expect(playButton).toBeTruthy()
    })

    it("shows pause button when playing", () => {
      mockAudio.isPlaying = true
      renderPracticeControls()

      const pauseButton = screen.getByTitle("Pause")
      expect(pauseButton).toBeTruthy()
    })

    it("disables play button when no MIDI data", () => {
      renderPracticeControls({ midiBase64: null })

      const playButton = screen.getByTitle("Play")
      expect((playButton as HTMLButtonElement).disabled).toBe(true)
    })

    it("disables play button when session is active", () => {
      renderPracticeControls({ isActive: true })

      const playButton = screen.getByTitle("Play")
      expect((playButton as HTMLButtonElement).disabled).toBe(true)
    })

    it("calls audio.play when play button clicked", () => {
      mockAudio.isPlaying = false
      renderPracticeControls()

      fireEvent.click(screen.getByTitle("Play"))

      expect(mockAudio.play).toHaveBeenCalledTimes(1)
    })

    it("calls audio.pause when pause button clicked", () => {
      mockAudio.isPlaying = true
      renderPracticeControls()

      fireEvent.click(screen.getByTitle("Pause"))

      expect(mockAudio.pause).toHaveBeenCalledTimes(1)
    })

    it("calls audio.stop when stop button clicked", () => {
      renderPracticeControls()

      fireEvent.click(screen.getByTitle("Stop"))

      expect(mockAudio.stop).toHaveBeenCalledTimes(1)
    })

    it("disables stop button when no MIDI data", () => {
      renderPracticeControls({ midiBase64: null })

      const stopButton = screen.getByTitle("Stop")
      expect((stopButton as HTMLButtonElement).disabled).toBe(true)
    })
  })
})
