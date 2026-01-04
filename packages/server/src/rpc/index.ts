import { Effect, Layer, pipe, Runtime } from "effect"
import { HttpServerRequest, HttpServerResponse } from "@effect/platform"
import { RpcServer, RpcSerialization } from "@effect/rpc"
import { SessionRpcs } from "@etude/shared"
import { SessionRpcsLive } from "./session.js"
import { SessionServiceImpl } from "../services/session.js"
import { ComparisonServiceLive } from "../services/comparison.js"
import { PieceRepoLive } from "../repos/piece-repo.js"
import { AttemptRepoLive } from "../repos/attempt-repo.js"
import { SessionStateStore } from "../services/session-state-store.js"
import type { SqlClient } from "@effect/sql"

/**
 * Creates an RPC request handler for session endpoints.
 * Uses Effect runtime to process RPC requests.
 *
 * @param sessionStateStore - The session state store implementation
 * @param sqlLayer - Layer providing SqlClient
 * @returns Handler function that processes RPC requests
 */
export function createRpcHandler(
  sessionStateStore: SessionStateStore["Type"],
  sqlLayer: Layer.Layer<SqlClient.SqlClient>
) {
  const SessionStateStoreLive = Layer.succeed(SessionStateStore, sessionStateStore)

  const RepoLayer = Layer.mergeAll(PieceRepoLive, AttemptRepoLive)

  // Build session layer with all dependencies
  const SessionLayer = pipe(
    SessionServiceImpl,
    Layer.provide(Layer.mergeAll(RepoLayer, ComparisonServiceLive, SessionStateStoreLive))
  )

  // RPC handlers with all dependencies merged
  const FullRpcLayer = pipe(
    SessionRpcsLive,
    Layer.provide(SessionLayer),
    Layer.provide(sqlLayer)
  )

  // Combined layer with serialization
  const AppLayer = Layer.mergeAll(FullRpcLayer, RpcSerialization.layerNdjson)

  // Create handler that processes requests
  return {
    handler: async (request: Request): Promise<Response> => {
      const effect = Effect.gen(function* () {
        // Get the RPC app with all dependencies
        const app = yield* RpcServer.toHttpApp(SessionRpcs)

        // Create HttpServerRequest from the web Request
        const httpRequest = HttpServerRequest.fromWeb(request)

        // Run the RPC app with the request
        const response = yield* app.pipe(
          Effect.provideService(HttpServerRequest.HttpServerRequest, httpRequest)
        )

        // Convert to web Response
        return HttpServerResponse.toWeb(response)
      }).pipe(
        Effect.provide(AppLayer),
        Effect.scoped
      )

      return Runtime.runPromise(Runtime.defaultRuntime)(effect)
    },
  }
}

export { SessionRpcsLive } from "./session.js"
export { SessionRpcs } from "@etude/shared"
