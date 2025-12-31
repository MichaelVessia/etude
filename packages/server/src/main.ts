import { Effect } from "effect"

const main = Effect.gen(function* () {
  yield* Effect.log("etude server starting...")
})

Effect.runPromise(main)
