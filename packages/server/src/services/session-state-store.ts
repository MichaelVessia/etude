import { Effect, Layer, Ref, Context } from "effect"
import type { SessionState } from "./session.js"
import type { SerializedSessionState, DurableObjectStub } from "../session-do.js"

/**
 * Abstract state store for session data.
 * Allows swapping between local Ref (dev) and Durable Objects (production).
 */
export class SessionStateStore extends Context.Tag("SessionStateStore")<
  SessionStateStore,
  {
    readonly get: () => Effect.Effect<SessionState | null>
    readonly set: (state: SessionState) => Effect.Effect<void>
    readonly clear: () => Effect.Effect<void>
  }
>() {}

// Convert SessionState to serializable form
function serialize(state: SessionState): SerializedSessionState {
  return {
    ...state,
    matchedIndices: Array.from(state.matchedIndices),
  }
}

// Convert serialized form back to SessionState
function deserialize(data: SerializedSessionState): SessionState {
  return {
    ...data,
    matchedIndices: new Set(data.matchedIndices),
  }
}

/**
 * Local Ref-based implementation for development.
 */
export const LocalSessionStateStoreLive = Layer.effect(
  SessionStateStore,
  Effect.gen(function* () {
    const ref = yield* Ref.make<SessionState | null>(null)

    return {
      get: () => Ref.get(ref),
      set: (state: SessionState) => Ref.set(ref, state),
      clear: () => Ref.set(ref, null),
    }
  })
)

/**
 * Durable Object-based implementation for Cloudflare Workers.
 * Requires a DO stub to be provided for each request.
 * Errors are logged and handled gracefully (returns null/void).
 */
export const makeDOSessionStateStore = (
  stub: DurableObjectStub
): Context.Tag.Service<typeof SessionStateStore> => ({
  get: () =>
    Effect.tryPromise({
      try: async () => {
        const response = await stub.fetch("https://session/state")
        const data = (await response.json()) as { state: SerializedSessionState | null }
        return data.state ? deserialize(data.state) : null
      },
      catch: (error) => new Error(`Failed to get session state: ${error}`),
    }).pipe(
      Effect.catchAll((error) =>
        Effect.gen(function* () {
          yield* Effect.logError(`Session state get failed: ${error.message}`)
          return null
        })
      )
    ),

  set: (state: SessionState) =>
    Effect.tryPromise({
      try: async () => {
        await stub.fetch("https://session/state", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ state: serialize(state) }),
        })
      },
      catch: (error) => new Error(`Failed to set session state: ${error}`),
    }).pipe(
      Effect.catchAll((error) =>
        Effect.logError(`Session state set failed: ${error.message}`)
      )
    ),

  clear: () =>
    Effect.tryPromise({
      try: async () => {
        await stub.fetch("https://session/state", { method: "DELETE" })
      },
      catch: (error) => new Error(`Failed to clear session state: ${error}`),
    }).pipe(
      Effect.catchAll((error) =>
        Effect.logError(`Session state clear failed: ${error.message}`)
      )
    ),
})
