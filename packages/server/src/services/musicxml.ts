import { XMLParser } from "fast-xml-parser"
import { Effect, Layer, Option } from "effect"
import {
  NoteEvent,
  MidiPitch,
  Milliseconds,
  MeasureNumber,
} from "@etude/shared"
import { ParseError } from "@etude/shared"

export interface ParsedPiece {
  name: string
  composer: string | null
  notes: NoteEvent[]
  totalMeasures: number
  defaultTempo: number // BPM
}

export class MusicXmlService extends Effect.Tag("MusicXmlService")<
  MusicXmlService,
  {
    readonly parse: (
      xml: string,
      filePath: string
    ) => Effect.Effect<ParsedPiece, ParseError>
  }
>() {}

// MIDI pitch mapping: C4 = 60
const stepToPitch: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
}

function noteToMidiPitch(
  step: string,
  octave: number,
  alter = 0
): number {
  const base = stepToPitch[step] ?? 0
  return 12 * (octave + 1) + base + alter
}

// Convert divisions to milliseconds based on tempo
function divisionsToMs(
  divisions: number,
  divisionsPerQuarter: number,
  tempo: number
): number {
  const quartersPerMinute = tempo
  const msPerQuarter = 60000 / quartersPerMinute
  return (divisions / divisionsPerQuarter) * msPerQuarter
}

export const MusicXmlServiceLive = Layer.succeed(
  MusicXmlService,
  MusicXmlService.of({
    parse: (xml: string, filePath: string) =>
      Effect.gen(function* () {
        const parser = new XMLParser({
          ignoreAttributes: false,
          attributeNamePrefix: "@_",
          isArray: (name) =>
            ["part", "measure", "note", "attributes", "direction"].includes(
              name
            ),
        })

        let parsed: unknown
        try {
          parsed = parser.parse(xml)
        } catch (e) {
          return yield* new ParseError({
            reason: "MalformedXml",
            details: e instanceof Error ? e.message : String(e),
            filePath,
          })
        }

        const root = parsed as Record<string, unknown>
        const scorePartwise = root["score-partwise"] as
          | Record<string, unknown>
          | undefined

        if (!scorePartwise) {
          return yield* new ParseError({
            reason: "MalformedXml",
            details: "Missing score-partwise element",
            filePath,
          })
        }

        // Extract metadata
        const work = scorePartwise["work"] as Record<string, unknown> | undefined
        const identification = scorePartwise["identification"] as
          | Record<string, unknown>
          | undefined

        const name =
          (work?.["work-title"] as string) ||
          filePath.split("/").pop()?.replace(".xml", "") ||
          "Unknown"

        let composer: string | null = null
        if (identification?.["creator"]) {
          const creator = identification["creator"]
          if (typeof creator === "string") {
            composer = creator
          } else if (
            typeof creator === "object" &&
            creator !== null &&
            "#text" in creator
          ) {
            composer = (creator as { "#text": string })["#text"]
          }
        }

        // Find piano part(s)
        const parts = scorePartwise["part"] as unknown[] | undefined

        if (!parts || parts.length === 0) {
          return yield* new ParseError({
            reason: "EmptyPiece",
            details: "No parts found in score",
            filePath,
          })
        }

        // For now, use the first part (typically the piano)
        // In a more robust implementation, we'd filter by instrument
        const part = parts[0] as Record<string, unknown>
        const measures = part["measure"] as unknown[]

        if (!measures || measures.length === 0) {
          return yield* new ParseError({
            reason: "EmptyPiece",
            details: "No measures found in part",
            filePath,
          })
        }

        const notes: NoteEvent[] = []
        let currentTime = 0 // in divisions
        let divisionsPerQuarter = 1
        let tempo = 120 // default BPM
        let currentMeasure = 0

        for (const measureObj of measures) {
          const measure = measureObj as Record<string, unknown>
          const measureNumber = parseInt(
            (measure["@_number"] as string) || String(currentMeasure + 1),
            10
          )
          currentMeasure = measureNumber

          // Check for attributes (time signature, divisions)
          const attributes = measure["attributes"] as unknown[] | undefined
          if (attributes) {
            for (const attr of attributes) {
              const a = attr as Record<string, unknown>
              if (a["divisions"]) {
                divisionsPerQuarter = Number(a["divisions"])
              }
            }
          }

          // Check for tempo in direction (sound element or metronome)
          const directions = measure["direction"] as unknown[] | undefined
          if (directions) {
            for (const dir of directions) {
              const d = dir as Record<string, unknown>
              // Check sound element for tempo attribute
              const sound = d["sound"] as Record<string, unknown> | undefined
              if (sound?.["@_tempo"]) {
                tempo = Number(sound["@_tempo"])
              }
              // Check metronome element for per-minute
              const dirType = d["direction-type"] as Record<string, unknown> | undefined
              const metronome = dirType?.["metronome"] as Record<string, unknown> | undefined
              if (metronome?.["per-minute"]) {
                tempo = Number(metronome["per-minute"])
              }
            }
          }

          // Process notes, backup, and forward elements in order
          // We need to iterate through all measure children to handle them in sequence
          const measureNotes = measure["note"] as unknown[] | undefined
          const backups = measure["backup"] as unknown[] | Record<string, unknown> | undefined
          const forwards = measure["forward"] as unknown[] | Record<string, unknown> | undefined

          // Normalize backups and forwards to arrays
          const backupList = backups
            ? Array.isArray(backups)
              ? backups
              : [backups]
            : []
          const forwardList = forwards
            ? Array.isArray(forwards)
              ? forwards
              : [forwards]
            : []

          // Process notes first, then handle backup/forward
          // Note: In a proper implementation, we'd process XML children in order
          // For now, we'll handle the common pattern: notes, then backup, then more notes
          if (measureNotes) {
            let backupIndex = 0

            for (let i = 0; i < measureNotes.length; i++) {
              const note = measureNotes[i] as Record<string, unknown>

              // Skip rests
              if ("rest" in note) {
                const duration = Number(note["duration"] || 0)
                // Check if this note is part of a chord
                if (!("chord" in note)) {
                  currentTime += duration
                }
                continue
              }

              // Skip grace notes for scoring purposes
              if ("grace" in note) {
                continue
              }

              const pitch = note["pitch"] as Record<string, unknown> | undefined
              if (!pitch) continue

              const step = (pitch["step"] as string) || "C"
              const octave = Number(pitch["octave"] || 4)
              const alter = Number(pitch["alter"] || 0)
              const duration = Number(note["duration"] || 0)

              // Determine hand from staff number (1 = treble/right, 2 = bass/left)
              const staff = Number(note["staff"] || 1)
              const hand = staff === 2 ? "left" : "right"

              // Get voice if available
              const voice = note["voice"]
                ? Option.some(Number(note["voice"]))
                : Option.none()

              // Handle tied notes - only count the first note of a tie
              const tieElements = note["tie"] as
                | unknown[]
                | Record<string, unknown>
                | undefined
              let isTiedContinuation = false
              if (tieElements) {
                const ties = Array.isArray(tieElements)
                  ? tieElements
                  : [tieElements]
                for (const tie of ties) {
                  const t = tie as Record<string, unknown>
                  if (t["@_type"] === "stop") {
                    isTiedContinuation = true
                  }
                }
              }

              // Skip tied continuations
              if (isTiedContinuation) {
                if (!("chord" in note)) {
                  currentTime += duration
                }
                continue
              }

              const midiPitch = noteToMidiPitch(step, octave, alter)
              const startTimeMs = divisionsToMs(
                currentTime,
                divisionsPerQuarter,
                tempo
              )
              const durationMs = divisionsToMs(
                duration,
                divisionsPerQuarter,
                tempo
              )

              notes.push(
                new NoteEvent({
                  pitch: midiPitch as MidiPitch,
                  startTime: startTimeMs as Milliseconds,
                  duration: durationMs as Milliseconds,
                  measure: measureNumber as MeasureNumber,
                  hand,
                  voice,
                })
              )

              // Advance time only if not a chord
              if (!("chord" in note)) {
                currentTime += duration
              }

              // Check if we need to apply backup after this note
              // This is a heuristic: if we're mid-measure and there are more notes
              // on a different voice, we likely need a backup
              if (backupIndex < backupList.length && i < measureNotes.length - 1) {
                const nextNote = measureNotes[i + 1] as Record<string, unknown> | undefined
                const currentVoice = note["voice"]
                const nextVoice = nextNote?.["voice"]

                // If voice changes, apply backup
                if (nextVoice && currentVoice !== nextVoice) {
                  const b = backupList[backupIndex] as Record<string, unknown>
                  if (b?.["duration"]) {
                    currentTime -= Number(b["duration"])
                  }
                  backupIndex++
                }
              }
            }
          }

          // Handle any remaining forward elements at end of measure
          for (const f of forwardList) {
            const fwd = f as Record<string, unknown>
            if (fwd?.["duration"]) {
              currentTime += Number(fwd["duration"])
            }
          }
        }

        if (notes.length === 0) {
          return yield* new ParseError({
            reason: "EmptyPiece",
            details: "No playable notes found in score",
            filePath,
          })
        }

        return {
          name,
          composer,
          notes,
          totalMeasures: currentMeasure,
          defaultTempo: tempo,
        }
      }),
  })
)
