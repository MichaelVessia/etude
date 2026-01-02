import { Effect, Layer, pipe } from "effect"
import {
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
} from "@effect/platform"
import { SessionServiceLive } from "../../src/services/session.js"
import { ComparisonServiceLive } from "../../src/services/comparison.js"
import { MusicXmlServiceLive } from "../../src/services/musicxml.js"
import { PieceRepoLive } from "../../src/repos/piece-repo.js"
import { AttemptRepoLive } from "../../src/repos/attempt-repo.js"
import { SqliteTestLayer } from "./test-db.js"
import { sessionRoutes } from "../../src/api/routes/session.js"
import { pieceRoutes } from "../../src/api/routes/piece.js"

// Build service layers bottom-up (mirrors server.ts but with test SQLite)
const RepoLayer = pipe(
  Layer.mergeAll(PieceRepoLive, AttemptRepoLive),
  Layer.provide(SqliteTestLayer)
)

const SessionLayer = pipe(
  SessionServiceLive,
  Layer.provide(RepoLayer),
  Layer.provide(ComparisonServiceLive)
)

// Full service layer with test SQLite
export const TestServiceLayer = Layer.mergeAll(
  SessionLayer,
  ComparisonServiceLive,
  MusicXmlServiceLive,
  RepoLayer,
  SqliteTestLayer
)

// Build router matching server.ts
const router = HttpRouter.empty.pipe(
  HttpRouter.get("/health", HttpServerResponse.text("ok")),
  HttpRouter.mount("/api/session", sessionRoutes),
  HttpRouter.mount("/api/piece", pieceRoutes)
)

// Create a test request
export const makeRequest = (
  method: string,
  path: string,
  body?: unknown
): Request => {
  const init: RequestInit = {
    method,
    headers: { "Content-Type": "application/json" },
  }
  if (body !== undefined) {
    init.body = JSON.stringify(body)
  }
  return new Request(`http://localhost${path}`, init)
}

// Run a request through the router and get the response
export const runRequest = (request: Request) =>
  Effect.gen(function* () {
    const serverRequest = HttpServerRequest.fromWeb(request)
    const response = yield* router.pipe(
      Effect.provideService(
        HttpServerRequest.HttpServerRequest,
        serverRequest
      )
    )
    return response
  })

// Parse JSON from HttpServerResponse
export const getResponseJson = (response: HttpServerResponse.HttpServerResponse) =>
  Effect.sync(() => {
    const body = response.body
    if (body._tag === "Uint8Array") {
      const text = new TextDecoder().decode(body.body)
      return JSON.parse(text)
    }
    // Handle other body types if needed
    return null
  })

// Convenience: run request and parse JSON response
export const runRequestJson = (request: Request) =>
  Effect.gen(function* () {
    const response = yield* runRequest(request)
    const json = yield* getResponseJson(response)
    return { response, json }
  })
