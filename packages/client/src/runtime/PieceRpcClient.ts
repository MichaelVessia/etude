import { Effect, Layer } from "effect"
import { RpcClient, RpcSerialization } from "@effect/rpc"
import { FetchHttpClient } from "@effect/platform"
import { PieceRpcs } from "@etude/shared"

// API base URL - uses vite proxy in dev, same origin in prod
const RPC_URL = "/rpc/piece"

/**
 * RPC client protocol layer for piece operations.
 * Uses HTTP with ndjson serialization.
 */
export const PieceRpcProtocolLive = RpcClient.layerProtocolHttp({
  url: RPC_URL,
}).pipe(
  Layer.provide([
    FetchHttpClient.layer,
    RpcSerialization.layerNdjson,
  ])
)

/**
 * Piece RPC client service.
 * Provides type-safe access to piece RPC endpoints.
 */
export class PieceRpcClient extends Effect.Service<PieceRpcClient>()(
  "PieceRpcClient",
  {
    scoped: RpcClient.make(PieceRpcs),
    dependencies: [PieceRpcProtocolLive],
  }
) {}

/**
 * Layer providing the piece RPC client.
 */
export const PieceRpcClientLive = PieceRpcClient.Default
