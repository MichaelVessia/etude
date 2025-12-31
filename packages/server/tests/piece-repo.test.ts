import { describe, expect, it } from "@codeforbreakfast/bun-test-effect"
import { Effect, Option } from "effect"
import { PieceRepo, PieceRepoLive } from "../src/repos/piece-repo.js"
import { makeTestLayer, setupTables, clearTables } from "./helpers/test-db.js"
import { PieceId, MeasureNumber } from "@etude/shared"

const TestLayer = makeTestLayer(PieceRepoLive)

describe("PieceRepo", () => {
  describe("create", () => {
    it.effect("creates a piece with all fields", () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables

        const repo = yield* PieceRepo
        const created = yield* repo.create({
          name: "Test Piece",
          composer: "Bach",
          filePath: "/pieces/test.xml",
          totalMeasures: 32,
          difficulty: "intermediate",
          notesJson: "[]",
        })

        expect(created.name).toBe("Test Piece")
        expect(Option.getOrNull(created.composer)).toBe("Bach")
        expect(created.totalMeasures).toBe(32)
        expect(created.filePath).toBe("/pieces/test.xml")
        expect(Option.getOrNull(created.difficulty)).toBe("intermediate")
      }).pipe(Effect.provide(TestLayer))
    )

    it.effect("creates a piece with null optional fields", () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables

        const repo = yield* PieceRepo
        const created = yield* repo.create({
          name: "Test Piece 2",
          composer: null,
          filePath: "/pieces/test2.xml",
          totalMeasures: 16,
          difficulty: null,
          notesJson: "[]",
        })

        expect(created.name).toBe("Test Piece 2")
        expect(Option.isNone(created.composer)).toBe(true)
        expect(Option.isNone(created.difficulty)).toBe(true)
      }).pipe(Effect.provide(TestLayer))
    )
  })

  describe("list", () => {
    it.effect("lists all pieces ordered by name", () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables

        const repo = yield* PieceRepo
        yield* repo.create({
          name: "Zebra Piece",
          composer: null,
          filePath: "/pieces/zebra.xml",
          totalMeasures: 10,
          difficulty: null,
          notesJson: "[]",
        })
        yield* repo.create({
          name: "Apple Piece",
          composer: null,
          filePath: "/pieces/apple.xml",
          totalMeasures: 20,
          difficulty: null,
          notesJson: "[]",
        })

        const pieces = yield* repo.list()
        expect(pieces.length).toBe(2)
        expect(pieces[0]!.name).toBe("Apple Piece")
        expect(pieces[1]!.name).toBe("Zebra Piece")
      }).pipe(Effect.provide(TestLayer))
    )
  })

  describe("getById", () => {
    it.effect("returns piece by id", () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables

        const repo = yield* PieceRepo
        const created = yield* repo.create({
          name: "Test Piece",
          composer: "Chopin",
          filePath: "/pieces/test.xml",
          totalMeasures: 32,
          difficulty: "advanced",
          notesJson: "[]",
        })

        const found = yield* repo.getById(created.id)
        expect(found.id).toBe(created.id)
        expect(found.name).toBe("Test Piece")
      }).pipe(Effect.provide(TestLayer))
    )

    it.effect("returns PieceNotFound for missing piece", () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables

        const repo = yield* PieceRepo
        const result = yield* repo
          .getById("nonexistent" as PieceId)
          .pipe(Effect.flip)

        expect(result._tag).toBe("PieceNotFound")
      }).pipe(Effect.provide(TestLayer))
    )
  })

  describe("getByFilePath", () => {
    it.effect("returns piece by file path", () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables

        const repo = yield* PieceRepo
        yield* repo.create({
          name: "Test Piece",
          composer: null,
          filePath: "/pieces/unique.xml",
          totalMeasures: 32,
          difficulty: null,
          notesJson: "[]",
        })

        const found = yield* repo.getByFilePath("/pieces/unique.xml")
        expect(found).not.toBeNull()
        expect(found!.filePath).toBe("/pieces/unique.xml")
      }).pipe(Effect.provide(TestLayer))
    )

    it.effect("returns null for missing file path", () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables

        const repo = yield* PieceRepo
        const found = yield* repo.getByFilePath("/pieces/missing.xml")
        expect(found).toBeNull()
      }).pipe(Effect.provide(TestLayer))
    )
  })

  describe("delete", () => {
    it.effect("deletes a piece", () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables

        const repo = yield* PieceRepo
        const created = yield* repo.create({
          name: "To Delete",
          composer: null,
          filePath: "/pieces/delete.xml",
          totalMeasures: 10,
          difficulty: null,
          notesJson: "[]",
        })

        yield* repo.delete(created.id)

        const result = yield* repo.getById(created.id).pipe(Effect.flip)
        expect(result._tag).toBe("PieceNotFound")
      }).pipe(Effect.provide(TestLayer))
    )
  })

  describe("getNotes", () => {
    it.effect("returns parsed notes JSON", () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables

        const repo = yield* PieceRepo
        const notesJson = JSON.stringify([
          { pitch: 60, startTime: 0, duration: 500, measure: 1, hand: "right" },
          { pitch: 62, startTime: 500, duration: 500, measure: 1, hand: "right" },
        ])

        const created = yield* repo.create({
          name: "With Notes",
          composer: null,
          filePath: "/pieces/notes.xml",
          totalMeasures: 1,
          difficulty: null,
          notesJson,
        })

        const notes = yield* repo.getNotes(created.id)
        expect(notes.length).toBe(2)
        expect(notes[0]!.pitch).toBe(60)
        expect(notes[1]!.pitch).toBe(62)
      }).pipe(Effect.provide(TestLayer))
    )
  })
})
