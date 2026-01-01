import { Effect, Layer, Logger, LogLevel } from "effect"
import { BunRuntime } from "@effect/platform-bun"
import { HttpLive } from "./api/server.js"

// Set log level from environment or default to Info
const logLevel = process.env.LOG_LEVEL === "debug" ? LogLevel.Debug : LogLevel.Info

const main = Effect.gen(function* () {
  yield* Effect.log("etude server starting...")
  return yield* Layer.launch(HttpLive)
}).pipe(
  Effect.provide(Logger.minimumLogLevel(logLevel))
)

BunRuntime.runMain(main)
