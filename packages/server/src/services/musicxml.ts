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

/**
 * Ordered element from preserveOrder parse mode.
 * Each element is an object with a single key (the tag name)
 * and value that is an array of children (also OrderedElements).
 * Text content appears as { "#text": value }.
 * Attributes appear as { ":@": { "@_attr": value } }.
 */
type OrderedElement = {
  [tagName: string]: OrderedElement[]
} & {
  ":@"?: Record<string, unknown>
  "#text"?: string | number
}

/** Get the tag name from an ordered element */
function getTagName(el: OrderedElement): string | null {
  for (const key of Object.keys(el)) {
    if (key !== ":@" && key !== "#text") return key
  }
  return null
}

/** Find first child with given tag name */
function findChild(children: OrderedElement[], tagName: string): OrderedElement | undefined {
  return children.find((c) => tagName in c)
}

/** Find all children with given tag name */
function findChildren(children: OrderedElement[], tagName: string): OrderedElement[] {
  return children.filter((c) => tagName in c)
}

/** Get text content from an element's children */
function getTextContent(children: OrderedElement[]): string | number | undefined {
  const textEl = children.find((c) => "#text" in c)
  return textEl?.["#text"]
}

/** Get a simple value from a child element */
function getChildValue(children: OrderedElement[], tagName: string): string | number | undefined {
  const child = findChild(children, tagName)
  if (!child) return undefined
  return getTextContent(child[tagName] as OrderedElement[])
}

/** Get attribute from ordered element */
function getAttribute(el: OrderedElement, attrName: string): string | undefined {
  const attrs = el[":@"]
  if (attrs) {
    return attrs[`@_${attrName}`] as string | undefined
  }
  return undefined
}

export const MusicXmlServiceLive = Layer.succeed(
  MusicXmlService,
  MusicXmlService.of({
    parse: (xml: string, filePath: string) =>
      Effect.gen(function* () {
        // Use preserveOrder to maintain document order of elements
        const parser = new XMLParser({
          ignoreAttributes: false,
          attributeNamePrefix: "@_",
          preserveOrder: true,
        })

        let parsed: OrderedElement[]
        try {
          parsed = parser.parse(xml) as OrderedElement[]
        } catch (e) {
          return yield* new ParseError({
            reason: "MalformedXml",
            details: e instanceof Error ? e.message : String(e),
            filePath,
          })
        }

        // Find score-partwise element
        const scorePartwise = findChild(parsed, "score-partwise")
        if (!scorePartwise) {
          return yield* new ParseError({
            reason: "MalformedXml",
            details: "Missing score-partwise element",
            filePath,
          })
        }

        const scoreChildren = scorePartwise["score-partwise"] as OrderedElement[]

        // Extract metadata
        const workEl = findChild(scoreChildren, "work")
        const identificationEl = findChild(scoreChildren, "identification")

        let name =
          filePath.split("/").pop()?.replace(".xml", "") || "Unknown"
        if (workEl) {
          const workChildren = workEl["work"] as OrderedElement[]
          const workTitle = getChildValue(workChildren, "work-title")
          if (workTitle) {
            name = String(workTitle)
          }
        }

        let composer: string | null = null
        if (identificationEl) {
          const idChildren = identificationEl["identification"] as OrderedElement[]
          const creatorEl = findChild(idChildren, "creator")
          if (creatorEl) {
            const creatorChildren = creatorEl["creator"] as OrderedElement[]
            const creatorText = getTextContent(creatorChildren)
            if (creatorText) {
              composer = String(creatorText)
            }
          }
        }

        // Find parts
        const parts = findChildren(scoreChildren, "part")
        if (parts.length === 0) {
          return yield* new ParseError({
            reason: "EmptyPiece",
            details: "No parts found in score",
            filePath,
          })
        }

        // Process the first part
        const partChildren = parts[0]!["part"] as OrderedElement[]
        const measures = findChildren(partChildren, "measure")

        if (measures.length === 0) {
          return yield* new ParseError({
            reason: "EmptyPiece",
            details: "No measures found in part",
            filePath,
          })
        }

        const notes: NoteEvent[] = []
        let cursor = 0 // Current time position in divisions
        let divisionsPerQuarter = 1
        let tempo = 120 // default BPM
        let lastMeasureNumber = 0

        for (const measureEl of measures) {
          const measureChildren = measureEl["measure"] as OrderedElement[]
          const measureNumber = parseInt(
            getAttribute(measureEl, "number") || String(lastMeasureNumber + 1),
            10
          )
          lastMeasureNumber = measureNumber

          // Process each child element in document order
          for (const child of measureChildren) {
            const tagName = getTagName(child)
            if (!tagName) continue

            switch (tagName) {
              case "attributes": {
                const attrChildren = child["attributes"] as OrderedElement[]
                const divValue = getChildValue(attrChildren, "divisions")
                if (divValue !== undefined) {
                  divisionsPerQuarter = Number(divValue)
                }
                break
              }

              case "direction": {
                const dirChildren = child["direction"] as OrderedElement[]
                // Check for sound element with tempo
                const soundEl = findChild(dirChildren, "sound")
                if (soundEl) {
                  const soundTempo = getAttribute(soundEl, "tempo")
                  if (soundTempo) {
                    tempo = Number(soundTempo)
                  }
                }
                // Check for metronome in direction-type
                const dirTypeEl = findChild(dirChildren, "direction-type")
                if (dirTypeEl) {
                  const dirTypeChildren = dirTypeEl["direction-type"] as OrderedElement[]
                  const metronomeEl = findChild(dirTypeChildren, "metronome")
                  if (metronomeEl) {
                    const metChildren = metronomeEl["metronome"] as OrderedElement[]
                    const perMinute = getChildValue(metChildren, "per-minute")
                    if (perMinute !== undefined) {
                      tempo = Number(perMinute)
                    }
                  }
                }
                break
              }

              case "backup": {
                const backupChildren = child["backup"] as OrderedElement[]
                const duration = Number(getChildValue(backupChildren, "duration") || 0)
                cursor -= duration
                break
              }

              case "forward": {
                const forwardChildren = child["forward"] as OrderedElement[]
                const duration = Number(getChildValue(forwardChildren, "duration") || 0)
                cursor += duration
                break
              }

              case "note": {
                const noteChildren = child["note"] as OrderedElement[]

                // Skip rests
                if (findChild(noteChildren, "rest")) {
                  // Advance cursor only if not a chord
                  if (!findChild(noteChildren, "chord")) {
                    const duration = Number(getChildValue(noteChildren, "duration") || 0)
                    cursor += duration
                  }
                  continue
                }

                // Skip grace notes for scoring purposes
                if (findChild(noteChildren, "grace")) {
                  continue
                }

                const pitchEl = findChild(noteChildren, "pitch")
                if (!pitchEl) continue

                const pitchChildren = pitchEl["pitch"] as OrderedElement[]
                const step = String(getChildValue(pitchChildren, "step") || "C")
                const octave = Number(getChildValue(pitchChildren, "octave") || 4)
                const alter = Number(getChildValue(pitchChildren, "alter") || 0)
                const duration = Number(getChildValue(noteChildren, "duration") || 0)

                // Determine hand from staff number (1 = treble/right, 2 = bass/left)
                const staffValue = getChildValue(noteChildren, "staff")
                const staff = staffValue !== undefined ? Number(staffValue) : 1
                const hand = staff === 2 ? "left" : "right"

                // Get voice if available
                const voiceValue = getChildValue(noteChildren, "voice")
                const voice = voiceValue !== undefined
                  ? Option.some(Number(voiceValue))
                  : Option.none()

                // Handle tied notes - only count the first note of a tie
                const tieElements = findChildren(noteChildren, "tie")
                let isTiedContinuation = false
                for (const tie of tieElements) {
                  const tieType = getAttribute(tie, "type")
                  if (tieType === "stop") {
                    isTiedContinuation = true
                  }
                }

                // Skip tied continuations
                if (isTiedContinuation) {
                  if (!findChild(noteChildren, "chord")) {
                    cursor += duration
                  }
                  continue
                }

                // Check if this is a chord note (shares time with previous note)
                const isChord = !!findChild(noteChildren, "chord")

                const midiPitch = noteToMidiPitch(step, octave, alter)
                const startTimeMs = divisionsToMs(
                  cursor,
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

                // Advance cursor only if not a chord
                if (!isChord) {
                  cursor += duration
                }
                break
              }
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
          totalMeasures: lastMeasureNumber,
          defaultTempo: tempo,
        }
      }),
  })
)
