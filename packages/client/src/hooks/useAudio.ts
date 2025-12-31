import { useCallback, useEffect, useRef, useState } from "react"
import * as Tone from "tone"
import { Midi } from "@tonejs/midi"
import type { MidiPitch, Milliseconds } from "@etude/shared"

export interface NoteToPlay {
  pitch: MidiPitch
  startTime: Milliseconds
  duration: Milliseconds
}

export interface UseAudioResult {
  isReady: boolean
  isPlaying: boolean
  currentTime: number
  tempo: number
  setTempo: (tempo: number) => void
  play: () => Promise<void>
  pause: () => void
  stop: () => void
  playNote: (pitch: number, duration?: number) => void
  loadMidi: (base64: string) => void
  loadNotes: (notes: NoteToPlay[]) => void
}

// Convert MIDI pitch to note name
function midiToNote(midi: number): string {
  const notes = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
  const octave = Math.floor(midi / 12) - 1
  const note = notes[midi % 12]
  return `${note}${octave}`
}

export function useAudio(): UseAudioResult {
  const [isReady, setIsReady] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [tempo, setTempoState] = useState(100) // percentage: 100 = normal speed

  const synthRef = useRef<Tone.PolySynth | null>(null)
  const partRef = useRef<Tone.Part | null>(null)
  const notesRef = useRef<NoteToPlay[]>([])
  const animationFrameRef = useRef<number | null>(null)

  // Initialize Tone.js synth
  useEffect(() => {
    const synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "triangle" },
      envelope: {
        attack: 0.02,
        decay: 0.1,
        sustain: 0.3,
        release: 0.8,
      },
    }).toDestination()

    synthRef.current = synth
    setIsReady(true)

    return () => {
      synth.dispose()
    }
  }, [])

  // Update time during playback
  useEffect(() => {
    const updateTime = () => {
      if (Tone.getTransport().state === "started") {
        setCurrentTime(Tone.getTransport().seconds * 1000)
        animationFrameRef.current = requestAnimationFrame(updateTime)
      }
    }

    if (isPlaying) {
      animationFrameRef.current = requestAnimationFrame(updateTime)
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [isPlaying])

  const setTempo = useCallback((newTempo: number) => {
    setTempoState(newTempo)
    // Adjust playback rate: 100% = 1.0, 50% = 0.5, 200% = 2.0
    Tone.getTransport().bpm.value = 120 * (newTempo / 100)
  }, [])

  const loadNotes = useCallback((notes: NoteToPlay[]) => {
    notesRef.current = notes

    // Clean up existing part
    if (partRef.current) {
      partRef.current.dispose()
    }

    const synth = synthRef.current
    if (!synth) return

    // Create a new part with the notes
    const part = new Tone.Part(
      (time, note: { pitch: number; duration: number }) => {
        synth.triggerAttackRelease(midiToNote(note.pitch), note.duration / 1000, time)
      },
      notes.map((n) => ({
        time: n.startTime / 1000,
        pitch: n.pitch,
        duration: n.duration,
      }))
    )

    part.start(0)
    partRef.current = part
  }, [])

  const loadMidi = useCallback(
    (base64: string) => {
      try {
        // Decode base64 MIDI
        const binary = atob(base64)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i)
        }

        const midi = new Midi(bytes.buffer)

        // Extract notes from all tracks
        const notes: NoteToPlay[] = []
        for (const track of midi.tracks) {
          for (const note of track.notes) {
            notes.push({
              pitch: note.midi as MidiPitch,
              startTime: (note.time * 1000) as Milliseconds,
              duration: (note.duration * 1000) as Milliseconds,
            })
          }
        }

        // Sort by start time
        notes.sort((a, b) => a.startTime - b.startTime)
        loadNotes(notes)
      } catch (err) {
        console.error("Failed to load MIDI:", err)
      }
    },
    [loadNotes]
  )

  const play = useCallback(async () => {
    // Start audio context if not started
    if (Tone.getContext().state !== "running") {
      await Tone.start()
    }

    Tone.getTransport().start()
    setIsPlaying(true)
  }, [])

  const pause = useCallback(() => {
    Tone.getTransport().pause()
    setIsPlaying(false)
  }, [])

  const stop = useCallback(() => {
    Tone.getTransport().stop()
    Tone.getTransport().seconds = 0
    setIsPlaying(false)
    setCurrentTime(0)
  }, [])

  const playNote = useCallback((pitch: number, duration = 0.5) => {
    const synth = synthRef.current
    if (!synth) return

    // Start audio context if needed
    if (Tone.getContext().state !== "running") {
      void Tone.start().then(() => {
        synth.triggerAttackRelease(midiToNote(pitch), duration)
      })
    } else {
      synth.triggerAttackRelease(midiToNote(pitch), duration)
    }
  }, [])

  return {
    isReady,
    isPlaying,
    currentTime,
    tempo,
    setTempo,
    play,
    pause,
    stop,
    playNote,
    loadMidi,
    loadNotes,
  }
}
