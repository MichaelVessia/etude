import { Effect, Layer } from "effect"
import { RpcClient } from "@effect/rpc"
import type { RpcGroup } from "@effect/rpc"
import type { FromServerEncoded } from "@effect/rpc/RpcMessage"

/**
 * Configuration for a mock RPC response.
 * Either provide success data or an error to simulate failure.
 */
export type MockRpcResponse<T> =
  | { success: T }
  | { error: { _tag: string; [key: string]: unknown } }

/**
 * A mapping of RPC method names to their mock responses.
 */
export type MockRpcResponses = Record<string, MockRpcResponse<unknown>>

/**
 * Creates a Protocol layer that returns mock responses without going through HTTP.
 * This avoids URL parsing issues in test environments like happy-dom.
 *
 * @example
 * ```ts
 * const TestLayer = makeRpcTestLayer(SessionRpcs, {
 *   startSession: { success: { sessionId: "test-123", ... } },
 *   submitNote: { error: { _tag: "SessionError", reason: "NotStarted" } },
 * })
 *
 * Effect.gen(function* () {
 *   const client = yield* RpcClient.make(SessionRpcs)
 *   const result = yield* client.startSession({ ... })
 * }).pipe(Effect.scoped, Effect.provide(TestLayer))
 * ```
 */
export function makeRpcTestLayer<Rpcs extends RpcGroup.Any>(
  _rpcs: Rpcs,
  responses: MockRpcResponses
): Layer.Layer<RpcClient.Protocol> {
  // Use Protocol.make which handles the run/send coordination
  const makeProtocol = RpcClient.Protocol.make(
    (writeResponse: (data: FromServerEncoded) => Effect.Effect<void>) =>
      Effect.succeed({
        supportsAck: false,
        supportsTransferables: false,

        send: (request: unknown) => {
          // Parse the request to extract method name
          // Request format: { _tag: "Request", id: string, tag: string, payload?: unknown }
          const parsed = request as {
            _tag: string
            id: string
            tag: string
            payload?: unknown
          }

          if (parsed._tag !== "Request") {
            // Ignore non-Request messages (like Ack)
            return Effect.void
          }

          const methodName = parsed.tag
          const mockResponse = responses[methodName]

          if (!mockResponse) {
            return Effect.die(
              new Error(`No mock response configured for method: ${methodName}`)
            )
          }

          // Build response in ResponseExitEncoded format
          // Format: { _tag: "Exit", requestId: string, exit: ExitEncoded }
          let responseData: FromServerEncoded
          if ("success" in mockResponse) {
            // Success exit: { _tag: "Success", value: T }
            responseData = {
              _tag: "Exit",
              requestId: parsed.id,
              exit: {
                _tag: "Success",
                value: mockResponse.success,
              },
            } as unknown as FromServerEncoded
          } else {
            // Failure exit: { _tag: "Failure", cause: { _tag: "Fail", error: E } }
            responseData = {
              _tag: "Exit",
              requestId: parsed.id,
              exit: {
                _tag: "Failure",
                cause: {
                  _tag: "Fail",
                  error: mockResponse.error,
                },
              },
            } as unknown as FromServerEncoded
          }

          // Send response back via the write callback
          return writeResponse(responseData)
        },
      })
  )

  return Layer.scoped(RpcClient.Protocol, makeProtocol)
}

/**
 * Creates a test layer that simulates network errors for an RPC client.
 */
export function makeRpcNetworkErrorLayer(
  errorType: "timeout" | "500" | "malformed"
): Layer.Layer<RpcClient.Protocol> {
  const makeProtocol = RpcClient.Protocol.make(() =>
    Effect.succeed({
      supportsAck: false,
      supportsTransferables: false,
      send: () => {
        switch (errorType) {
          case "timeout":
            return Effect.die(new Error("Request timed out"))
          case "500":
            return Effect.die(new Error("Internal Server Error"))
          case "malformed":
            return Effect.die(new Error("Malformed JSON response"))
        }
      },
    })
  )

  return Layer.scoped(RpcClient.Protocol, makeProtocol)
}
