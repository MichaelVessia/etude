import { Layer, pipe } from "effect"
import { HttpRouter, HttpServer, HttpServerResponse } from "@effect/platform"
import { BunHttpServer } from "@effect/platform-bun"
import { SessionServiceLive } from "../services/session.js"
import { ComparisonServiceLive } from "../services/comparison.js"
import { PieceRepoLive } from "../repos/piece-repo.js"
import { AttemptRepoLive } from "../repos/attempt-repo.js"
import { SqlLive } from "../sql.js"
import { sessionRoutes } from "./routes/session.js"

const PORT = 3001

// Build service layers bottom-up
// SessionServiceLive depends on: PieceRepo, AttemptRepo, ComparisonService
// PieceRepoLive, AttemptRepoLive depend on: SqlClient
// ComparisonServiceLive has no dependencies

const RepoLayer = pipe(
  Layer.mergeAll(PieceRepoLive, AttemptRepoLive),
  Layer.provide(SqlLive)
)

// SessionServiceLive needs repos and comparison service
const SessionLayer = pipe(
  SessionServiceLive,
  Layer.provide(RepoLayer),
  Layer.provide(ComparisonServiceLive)
)

// Merge everything together for routes to use
const ServiceLayer = Layer.merge(SessionLayer, ComparisonServiceLive)

// Build router with all routes
const router = HttpRouter.empty.pipe(
  HttpRouter.get("/health", HttpServerResponse.text("ok")),
  HttpRouter.mount("/api/session", sessionRoutes)
)

// Layer that provides the HTTP server
export const HttpLive = pipe(
  router,
  HttpServer.serve(),
  HttpServer.withLogAddress,
  Layer.provide(BunHttpServer.layer({ port: PORT })),
  Layer.provide(ServiceLayer)
)
