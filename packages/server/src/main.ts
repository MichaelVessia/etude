import { Effect, Layer } from "effect"
import { BunRuntime } from "@effect/platform-bun"
import { HttpLive } from "./api/server.js"

const main = Effect.gen(function* () {
  yield* Effect.log("etude server starting...")
  return yield* Layer.launch(HttpLive)
})

BunRuntime.runMain(main)
