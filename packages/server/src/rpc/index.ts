import { Effect, Layer, pipe, Runtime } from "effect"
import { HttpServerRequest, HttpServerResponse } from "@effect/platform"
import { RpcServer, RpcSerialization } from "@effect/rpc"
import { SessionRpcs, PieceRpcs } from "@etude/shared"
import { SessionRpcsLive } from "./session.js"
import { PieceRpcsLive } from "./piece.js"
import { SessionServiceImpl } from "../services/session.js"
import { ComparisonServiceLive } from "../services/comparison.js"
import { MusicXmlServiceLive } from "../services/musicxml.js"
import { PieceRepoLive } from "../repos/piece-repo.js"
import { AttemptRepoLive } from "../repos/attempt-repo.js"
import { SessionStateStore } from "../services/session-state-store.js"
import type { SqlClient } from "@effect/sql"

/**
 * Creates RPC request handlers for all endpoints.
 * Uses Effect runtime to process RPC requests.
 *
 * @param sessionStateStore - The session state store implementation
 * @param sqlLayer - Layer providing SqlClient
 * @returns Handler functions that process RPC requests
 */
export function createRpcHandlers(
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

  // Session RPC handlers layer
  const SessionRpcLayer = pipe(
    SessionRpcsLive,
    Layer.provide(SessionLayer),
    Layer.provide(sqlLayer)
  )

  // Piece RPC handlers layer
  const PieceRpcLayer = pipe(
    PieceRpcsLive,
    Layer.provide(RepoLayer),
    Layer.provide(MusicXmlServiceLive),
    Layer.provide(sqlLayer)
  )

  // Session app layer
  const SessionAppLayer = Layer.mergeAll(
    SessionRpcLayer,
    RpcSerialization.layerNdjson
  )

  // Piece app layer
  const PieceAppLayer = Layer.mergeAll(
    PieceRpcLayer,
    RpcSerialization.layerNdjson
  )

  // Session handler
  const sessionHandler = async (request: Request): Promise<Response> => {
    const effect = Effect.gen(function* () {
      const app = yield* RpcServer.toHttpApp(SessionRpcs)
      const httpRequest = HttpServerRequest.fromWeb(request)
      const response = yield* app.pipe(
        Effect.provideService(HttpServerRequest.HttpServerRequest, httpRequest)
      )
      return HttpServerResponse.toWeb(response)
    }).pipe(
      Effect.provide(SessionAppLayer),
      Effect.scoped
    )

    return Runtime.runPromise(Runtime.defaultRuntime)(effect)
  }

  // Piece handler
  const pieceHandler = async (request: Request): Promise<Response> => {
    const effect = Effect.gen(function* () {
      const app = yield* RpcServer.toHttpApp(PieceRpcs)
      const httpRequest = HttpServerRequest.fromWeb(request)
      const response = yield* app.pipe(
        Effect.provideService(HttpServerRequest.HttpServerRequest, httpRequest)
      )
      return HttpServerResponse.toWeb(response)
    }).pipe(
      Effect.provide(PieceAppLayer),
      Effect.scoped
    )

    return Runtime.runPromise(Runtime.defaultRuntime)(effect)
  }

  return {
    session: sessionHandler,
    piece: pieceHandler,
  }
}

// Legacy export for backwards compatibility
export function createRpcHandler(
  sessionStateStore: SessionStateStore["Type"],
  sqlLayer: Layer.Layer<SqlClient.SqlClient>
) {
  const handlers = createRpcHandlers(sessionStateStore, sqlLayer)
  return { handler: handlers.session }
}

export { SessionRpcsLive } from "./session.js"
export { PieceRpcsLive } from "./piece.js"
export { SessionRpcs, PieceRpcs } from "@etude/shared"
