import { Effect, Layer, pipe } from "effect"
import {
  HttpRouter,
  HttpServerResponse,
  HttpServerRequest,
  HttpApp,
} from "@effect/platform"
import { SessionServiceLive } from "../services/session.js"
import { ComparisonServiceLive } from "../services/comparison.js"
import { MusicXmlServiceLive } from "../services/musicxml.js"
import { PieceRepoLive } from "../repos/piece-repo.js"
import { AttemptRepoLive } from "../repos/attempt-repo.js"
import { sessionRoutes } from "./routes/session.js"
import { pieceRoutes } from "./routes/piece.js"

// Build service layers bottom-up (requires SqlClient to be provided)
export const RepoLayer = Layer.mergeAll(PieceRepoLive, AttemptRepoLive)

const SessionLayer = pipe(
  SessionServiceLive,
  Layer.provide(RepoLayer),
  Layer.provide(ComparisonServiceLive)
)

// ServiceLayer requires SqlClient to be provided externally
export const ServiceLayer = Layer.mergeAll(SessionLayer, ComparisonServiceLive, MusicXmlServiceLive, RepoLayer)

// Add CORS headers to all responses
const addCorsHeaders = <E, R>(app: HttpApp.Default<E, R>): HttpApp.Default<E, R> =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest

    // Handle preflight OPTIONS
    if (request.method === "OPTIONS") {
      return HttpServerResponse.empty({
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Max-Age": "86400",
        },
      })
    }

    const response = yield* app
    return HttpServerResponse.setHeader(response, "Access-Control-Allow-Origin", "*")
  }) as HttpApp.Default<E, R>

// Build router with all routes
export const router = HttpRouter.empty.pipe(
  HttpRouter.get("/health", HttpServerResponse.text("ok")),
  HttpRouter.mount("/api/session", sessionRoutes),
  HttpRouter.mount("/api/piece", pieceRoutes)
)

// Apply CORS to router
export const routerWithCors = addCorsHeaders(router)
