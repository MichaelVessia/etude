import { describe, expect, it } from "@codeforbreakfast/bun-test-effect"
import { Effect } from "effect"
import {
  MusicXmlService,
  MusicXmlServiceLive,
} from "../src/services/musicxml.js"
import { readFileSync } from "fs"
import { join } from "path"

describe("MusicXmlService", () => {
  describe("parse", () => {
    it.effect("parses a simple MusicXML file", () =>
      Effect.gen(function* () {
        const service = yield* MusicXmlService

        const xml = readFileSync(
          join(import.meta.dir, "fixtures/simple.xml"),
          "utf-8"
        )

        const result = yield* service.parse(xml, "/test/simple.xml")

        expect(result.name).toBe("Simple Test Piece")
        expect(result.composer).toBe("Test Composer")
        expect(result.defaultTempo).toBe(120)
        expect(result.totalMeasures).toBe(2)
        expect(result.notes.length).toBe(6) // 4 notes in measure 1, 2 in measure 2
      }).pipe(Effect.provide(MusicXmlServiceLive))
    )

    it.effect("extracts correct note pitches", () =>
      Effect.gen(function* () {
        const service = yield* MusicXmlService

        const xml = readFileSync(
          join(import.meta.dir, "fixtures/simple.xml"),
          "utf-8"
        )

        const result = yield* service.parse(xml, "/test/simple.xml")

        // C4 = 60, D4 = 62, E4 = 64, F4 = 65, G4 = 67, C3 = 48
        expect(result.notes[0]!.pitch).toBe(60) // C4
        expect(result.notes[1]!.pitch).toBe(62) // D4
        expect(result.notes[2]!.pitch).toBe(64) // E4
        expect(result.notes[3]!.pitch).toBe(65) // F4
        expect(result.notes[4]!.pitch).toBe(67) // G4
        expect(result.notes[5]!.pitch).toBe(48) // C3
      }).pipe(Effect.provide(MusicXmlServiceLive))
    )

    it.effect("assigns correct hand based on staff", () =>
      Effect.gen(function* () {
        const service = yield* MusicXmlService

        const xml = readFileSync(
          join(import.meta.dir, "fixtures/simple.xml"),
          "utf-8"
        )

        const result = yield* service.parse(xml, "/test/simple.xml")

        // Staff 1 = right hand, Staff 2 = left hand
        expect(result.notes[0]!.hand).toBe("right") // C4, staff 1
        expect(result.notes[5]!.hand).toBe("left") // C3, staff 2
      }).pipe(Effect.provide(MusicXmlServiceLive))
    )

    it.effect("calculates correct timing", () =>
      Effect.gen(function* () {
        const service = yield* MusicXmlService

        const xml = readFileSync(
          join(import.meta.dir, "fixtures/simple.xml"),
          "utf-8"
        )

        const result = yield* service.parse(xml, "/test/simple.xml")

        // At 120 BPM, quarter note = 500ms
        expect(result.notes[0]!.startTime).toBe(0) // First note at 0
        expect(result.notes[1]!.startTime).toBe(500) // Second note at 500ms
        expect(result.notes[2]!.startTime).toBe(1000) // Third note at 1000ms
        expect(result.notes[3]!.startTime).toBe(1500) // Fourth note at 1500ms
        expect(result.notes[4]!.startTime).toBe(2000) // G4 in measure 2
        // C3 is on staff 2 but happens at the same time as G4
        expect(result.notes[5]!.startTime).toBe(2000)
      }).pipe(Effect.provide(MusicXmlServiceLive))
    )

    it.effect("returns ParseError for invalid XML", () =>
      Effect.gen(function* () {
        const service = yield* MusicXmlService

        const result = yield* service
          .parse("not xml at all", "/test/bad.xml")
          .pipe(Effect.flip)

        expect(result._tag).toBe("ParseError")
        expect(result.reason).toBe("MalformedXml")
      }).pipe(Effect.provide(MusicXmlServiceLive))
    )

    it.effect("returns ParseError for empty piece", () =>
      Effect.gen(function* () {
        const service = yield* MusicXmlService

        const xml = `<?xml version="1.0"?>
          <score-partwise>
            <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
          </score-partwise>`

        const result = yield* service
          .parse(xml, "/test/empty.xml")
          .pipe(Effect.flip)

        expect(result._tag).toBe("ParseError")
        expect(result.reason).toBe("EmptyPiece")
      }).pipe(Effect.provide(MusicXmlServiceLive))
    )
  })

  describe("multi-voice handling", () => {
    it.effect("parses two voices in treble clef with correct timings", () =>
      Effect.gen(function* () {
        const service = yield* MusicXmlService

        const xml = readFileSync(
          join(import.meta.dir, "fixtures/two-voice-treble.xml"),
          "utf-8"
        )

        const result = yield* service.parse(xml, "/test/two-voice-treble.xml")

        expect(result.name).toBe("Two Voice Treble Test")
        expect(result.notes.length).toBe(6)

        // At 120 BPM with divisions=2, quarter note = 500ms
        // Voice 1: C4 at 0, D4 at 500, E4 at 1000, F4 at 1500
        // Voice 2: G3 at 0 (after backup), A3 at 1000 (after backup)

        // Find notes by pitch
        const c4 = result.notes.find((n) => n.pitch === 60) // C4
        const d4 = result.notes.find((n) => n.pitch === 62) // D4
        const e4 = result.notes.find((n) => n.pitch === 64) // E4
        const f4 = result.notes.find((n) => n.pitch === 65) // F4
        const g3 = result.notes.find((n) => n.pitch === 55) // G3
        const a3 = result.notes.find((n) => n.pitch === 57) // A3

        expect(c4).toBeDefined()
        expect(d4).toBeDefined()
        expect(e4).toBeDefined()
        expect(f4).toBeDefined()
        expect(g3).toBeDefined()
        expect(a3).toBeDefined()

        // Verify timings
        expect(c4!.startTime).toBe(0) // Beat 1
        expect(d4!.startTime).toBe(500) // Beat 2
        expect(g3!.startTime).toBe(0) // Beat 1 (same as C4, different voice)
        expect(e4!.startTime).toBe(1000) // Beat 3
        expect(f4!.startTime).toBe(1500) // Beat 4
        expect(a3!.startTime).toBe(1000) // Beat 3 (same as E4, different voice)
      }).pipe(Effect.provide(MusicXmlServiceLive))
    )

    it.effect("parses piano grand staff with backup/forward correctly", () =>
      Effect.gen(function* () {
        const service = yield* MusicXmlService

        const xml = readFileSync(
          join(import.meta.dir, "fixtures/piano-grand-staff.xml"),
          "utf-8"
        )

        const result = yield* service.parse(xml, "/test/piano-grand-staff.xml")

        expect(result.name).toBe("Piano Grand Staff Test")
        expect(result.totalMeasures).toBe(2)

        // Measure 1: RH C4 D4 E4 F4, LH C3 G3
        // Measure 2: RH G4 A4, LH E3 F3 (with forward skip)

        // At 120 BPM with divisions=2:
        // Quarter = 500ms, Half = 1000ms, Whole measure = 2000ms

        // Find notes by pitch and measure
        const m1Notes = result.notes.filter((n) => n.measure === 1)
        const m2Notes = result.notes.filter((n) => n.measure === 2)

        expect(m1Notes.length).toBe(6) // 4 RH + 2 LH
        expect(m2Notes.length).toBe(4) // 2 RH + 2 LH

        // Measure 1 RH notes
        const m1c4 = m1Notes.find((n) => n.pitch === 60)! // C4
        const m1d4 = m1Notes.find((n) => n.pitch === 62)! // D4
        const m1e4 = m1Notes.find((n) => n.pitch === 64)! // E4
        const m1f4 = m1Notes.find((n) => n.pitch === 65)! // F4

        expect(m1c4.startTime).toBe(0)
        expect(m1c4.hand).toBe("right")
        expect(m1d4.startTime).toBe(500)
        expect(m1e4.startTime).toBe(1000)
        expect(m1f4.startTime).toBe(1500)

        // Measure 1 LH notes
        const m1c3 = m1Notes.find((n) => n.pitch === 48)! // C3
        const m1g3 = m1Notes.find((n) => n.pitch === 55)! // G3

        expect(m1c3.startTime).toBe(0) // After backup to beat 1
        expect(m1c3.hand).toBe("left")
        expect(m1g3.startTime).toBe(1000) // Beat 3

        // Measure 2 starts at 2000ms
        const baseTime = 2000

        // RH notes in measure 2
        const m2g4 = m2Notes.find((n) => n.pitch === 67)! // G4
        const m2a4 = m2Notes.find((n) => n.pitch === 69)! // A4

        expect(m2g4.startTime).toBe(baseTime) // Beat 1
        expect(m2a4.startTime).toBe(baseTime + 1000) // Beat 3

        // LH notes in measure 2 (forward skips beat 1)
        const m2e3 = m2Notes.find((n) => n.pitch === 52)! // E3
        const m2f3 = m2Notes.find((n) => n.pitch === 53)! // F3

        expect(m2e3.startTime).toBe(baseTime + 500) // Beat 2 (after forward)
        expect(m2e3.hand).toBe("left")
        expect(m2f3.startTime).toBe(baseTime + 1000) // Beat 3
      }).pipe(Effect.provide(MusicXmlServiceLive))
    )

    it.effect("parses twinkle twinkle with backup for LH correctly", () =>
      Effect.gen(function* () {
        const service = yield* MusicXmlService

        const xml = readFileSync(
          join(import.meta.dir, "../../..", "packages/client/public/pieces/twinkle.xml"),
          "utf-8"
        )

        const result = yield* service.parse(xml, "/test/twinkle.xml")

        expect(result.name).toBe("Twinkle Twinkle Little Star")
        expect(result.composer).toBe("Traditional")
        expect(result.defaultTempo).toBe(100)

        // At 100 BPM with divisions=2:
        // Quarter = 600ms, Half = 1200ms, Whole = 2400ms

        // Measure 1: RH C4 C4 G4 G4, LH C3 (whole)
        const m1Notes = result.notes.filter((n) => n.measure === 1)

        // 4 RH quarter notes + 1 LH whole note = 5 notes
        expect(m1Notes.length).toBe(5)

        // RH notes at beats 1, 2, 3, 4
        const rhNotes = m1Notes.filter((n) => n.hand === "right")
        const lhNotes = m1Notes.filter((n) => n.hand === "left")

        expect(rhNotes.length).toBe(4)
        expect(lhNotes.length).toBe(1)

        // All RH notes at correct times
        expect(rhNotes[0]!.startTime).toBe(0) // C4 at beat 1
        expect(rhNotes[1]!.startTime).toBe(600) // C4 at beat 2
        expect(rhNotes[2]!.startTime).toBe(1200) // G4 at beat 3
        expect(rhNotes[3]!.startTime).toBe(1800) // G4 at beat 4

        // LH whole note at beat 1 (after backup)
        expect(lhNotes[0]!.startTime).toBe(0)
        expect(lhNotes[0]!.pitch).toBe(48) // C3
      }).pipe(Effect.provide(MusicXmlServiceLive))
    )
  })
})
