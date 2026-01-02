import { describe, expect, it } from "@codeforbreakfast/bun-test-effect"
import { Effect } from "effect"
import {
  TestServiceLayer,
  makeRequest,
  runRequestJson,
} from "./helpers/test-http.js"
import { setupTables } from "./helpers/test-db.js"
import { readFileSync } from "fs"
import { join } from "path"

// Load the simple.xml fixture
const simpleXml = readFileSync(
  join(import.meta.dirname, "fixtures/simple.xml"),
  "utf-8"
)

describe("Piece Routes", () => {

  describe("GET /api/piece/list", () => {
    it.effect("returns empty list when no pieces", () =>
      Effect.gen(function* () {
        yield* setupTables

        const request = makeRequest("GET", "/api/piece/list")
        const { response, json } = yield* runRequestJson(request)

        expect(response.status).toBe(200)
        expect(json).toEqual([])
      }).pipe(Effect.provide(TestServiceLayer))
    )

    it.effect("returns list of pieces", () =>
      Effect.gen(function* () {
        yield* setupTables

        // First import a piece
        const importRequest = makeRequest("POST", "/api/piece/import", {
          id: "test-id",
          xml: simpleXml,
          filePath: "/test/simple.xml",
        })
        yield* runRequestJson(importRequest)

        // Then list pieces
        const listRequest = makeRequest("GET", "/api/piece/list")
        const { response, json } = yield* runRequestJson(listRequest)

        expect(response.status).toBe(200)
        expect(json).toHaveLength(1)
        expect(json[0].name).toBe("Simple Test Piece")
        expect(json[0].totalMeasures).toBe(2)
      }).pipe(Effect.provide(TestServiceLayer))
    )
  })

  describe("POST /api/piece/import", () => {
    it.effect("imports a piece from MusicXML", () =>
      Effect.gen(function* () {
        yield* setupTables

        const request = makeRequest("POST", "/api/piece/import", {
          id: "test-id",
          xml: simpleXml,
          filePath: "/test/simple.xml",
        })
        const { response, json } = yield* runRequestJson(request)

        expect(response.status).toBe(200)
        expect(json.name).toBe("Simple Test Piece")
        expect(json.totalMeasures).toBe(2)
        expect(json.noteCount).toBeGreaterThan(0)
      }).pipe(Effect.provide(TestServiceLayer))
    )

    it.effect("returns existing piece if already imported", () =>
      Effect.gen(function* () {
        yield* setupTables

        // Import piece first time
        const firstRequest = makeRequest("POST", "/api/piece/import", {
          id: "test-id-1",
          xml: simpleXml,
          filePath: "/test/simple.xml",
        })
        const { json: firstJson } = yield* runRequestJson(firstRequest)
        const firstId = firstJson.id

        // Import same file path again
        const secondRequest = makeRequest("POST", "/api/piece/import", {
          id: "test-id-2",
          xml: simpleXml,
          filePath: "/test/simple.xml",
        })
        const { response, json } = yield* runRequestJson(secondRequest)

        expect(response.status).toBe(200)
        expect(json.id).toBe(firstId)
        expect(json.alreadyExists).toBe(true)
      }).pipe(Effect.provide(TestServiceLayer))
    )

    it.effect("returns 400 for invalid XML", () =>
      Effect.gen(function* () {
        yield* setupTables

        const request = makeRequest("POST", "/api/piece/import", {
          id: "test-id",
          xml: "<invalid>not valid musicxml</invalid>",
          filePath: "/test/invalid.xml",
        })
        const { response, json } = yield* runRequestJson(request)

        expect(response.status).toBe(400)
        expect(json.error).toBeDefined()
      }).pipe(Effect.provide(TestServiceLayer))
    )

    it.effect("returns 400 for missing required fields", () =>
      Effect.gen(function* () {
        yield* setupTables

        const request = makeRequest("POST", "/api/piece/import", {
          id: "test-id",
          // missing xml and filePath
        })
        const { response, json } = yield* runRequestJson(request)

        expect(response.status).toBe(400)
        expect(json.error).toBeDefined()
      }).pipe(Effect.provide(TestServiceLayer))
    )

    it.effect("returns 400 for empty body", () =>
      Effect.gen(function* () {
        yield* setupTables

        const request = makeRequest("POST", "/api/piece/import", {})
        const { response, json } = yield* runRequestJson(request)

        expect(response.status).toBe(400)
        expect(json.error).toBeDefined()
      }).pipe(Effect.provide(TestServiceLayer))
    )
  })
})
