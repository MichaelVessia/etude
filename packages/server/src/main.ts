import { Effect, Layer, Logger, LogLevel, pipe } from "effect"
import { BunRuntime, BunHttpServer } from "@effect/platform-bun"
import { HttpServer } from "@effect/platform"
import { routerWithCors, ServiceLayer } from "./api/server.js"
import { SqlLive } from "./sql.js"

const PORT = 3001

// Full service layer with SQLite for local dev
const ServiceLayerWithSql = pipe(ServiceLayer, Layer.provide(SqlLive))

// Layer that provides the HTTP server (for local dev with SQLite)
const HttpLive = pipe(
  routerWithCors,
  HttpServer.serve(),
  HttpServer.withLogAddress,
  Layer.provide(BunHttpServer.layer({ port: PORT })),
  Layer.provide(ServiceLayerWithSql)
)

// Set log level from environment or default to Info
const logLevel = process.env.LOG_LEVEL === "debug" ? LogLevel.Debug : LogLevel.Info

const main = Effect.gen(function* () {
  yield* Effect.log("etude server starting...")
  return yield* Layer.launch(HttpLive)
}).pipe(
  Effect.provide(Logger.minimumLogLevel(logLevel))
)

BunRuntime.runMain(main)
