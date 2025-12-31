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
})
