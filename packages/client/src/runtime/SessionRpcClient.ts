import { Effect, Layer } from "effect"
import { RpcClient, RpcSerialization } from "@effect/rpc"
import { FetchHttpClient } from "@effect/platform"
import { SessionRpcs } from "@etude/shared"

// API base URL - uses vite proxy in dev, same origin in prod
const RPC_URL = "/rpc"

/**
 * RPC client protocol layer for session operations.
 * Uses HTTP with ndjson serialization.
 */
export const SessionRpcProtocolLive = RpcClient.layerProtocolHttp({
  url: RPC_URL,
}).pipe(
  Layer.provide([
    FetchHttpClient.layer,
    RpcSerialization.layerNdjson,
  ])
)

/**
 * Session RPC client service.
 * Provides type-safe access to session RPC endpoints.
 */
export class SessionRpcClient extends Effect.Service<SessionRpcClient>()(
  "SessionRpcClient",
  {
    scoped: RpcClient.make(SessionRpcs),
    dependencies: [SessionRpcProtocolLive],
  }
) {}

/**
 * Layer providing the session RPC client.
 */
export const SessionRpcClientLive = SessionRpcClient.Default
