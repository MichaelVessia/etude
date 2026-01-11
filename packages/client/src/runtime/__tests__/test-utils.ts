import { Effect, Layer } from "effect"
import {
  HttpClient,
  HttpClientResponse,
  HttpClientRequest,
} from "@effect/platform"
import { RpcSerialization, RpcClient } from "@effect/rpc"
import type { RpcGroup } from "@effect/rpc"

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
 * Creates an HttpClient layer that intercepts requests and returns mock responses.
 * The responses are matched based on the RPC method name in the request payload.
 */
export function makeMockHttpClientLayer(
  responses: MockRpcResponses
): Layer.Layer<HttpClient.HttpClient> {
  const mockExecute = (
    request: HttpClientRequest.HttpClientRequest
  ): Effect.Effect<HttpClientResponse.HttpClientResponse> =>
    Effect.gen(function* () {
      // Parse the request body to extract the RPC method
      const body = request.body
      if (body._tag !== "Uint8Array") {
        return yield* Effect.die(new Error(`Expected Uint8Array body, got ${body._tag}`))
      }

      const bodyText = new TextDecoder().decode(body.body)

      // Parse NDJSON request format: {"_tag":"Request","id":0,"tag":"methodName","payload":...}
      const parsed = JSON.parse(bodyText) as {
        _tag: string
        id: number
        tag: string
        payload?: unknown
      }

      if (parsed._tag !== "Request") {
        return yield* Effect.die(
          new Error(`Unexpected request type: ${parsed._tag}`)
        )
      }

      const methodName = parsed.tag
      const mockResponse = responses[methodName]

      if (!mockResponse) {
        return yield* Effect.die(
          new Error(`No mock response configured for method: ${methodName}`)
        )
      }

      // Build the RPC response format
      let responsePayload: unknown
      if ("success" in mockResponse) {
        responsePayload = [
          {
            _tag: "Success",
            id: parsed.id,
            value: mockResponse.success,
          },
        ]
      } else {
        responsePayload = [
          {
            _tag: "Failure",
            id: parsed.id,
            error: mockResponse.error,
          },
        ]
      }

      const responseBody = JSON.stringify(responsePayload)

      // Create a mock response
      const response = HttpClientResponse.fromWeb(
        request,
        new Response(responseBody, {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )

      return response
    })

  const mockClient = HttpClient.make(mockExecute)

  return Layer.succeed(HttpClient.HttpClient, mockClient)
}

/**
 * Creates a test layer for an RPC client with mocked HTTP responses.
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
 * }).pipe(Effect.provide(TestLayer))
 * ```
 */
export function makeRpcTestLayer<Rpcs extends RpcGroup.Any>(
  _rpcs: Rpcs,
  responses: MockRpcResponses,
  url = "/rpc"
): Layer.Layer<RpcClient.Protocol> {
  const mockHttpLayer = makeMockHttpClientLayer(responses)

  return RpcClient.layerProtocolHttp({ url }).pipe(
    Layer.provide(mockHttpLayer),
    Layer.provide(RpcSerialization.layerJson)
  )
}

/**
 * Creates a mock HTTP response that simulates network/transport errors.
 */
export function makeMockNetworkErrorLayer(
  errorType: "timeout" | "500" | "malformed"
): Layer.Layer<HttpClient.HttpClient> {
  const mockExecute = (
    request: HttpClientRequest.HttpClientRequest
  ): Effect.Effect<HttpClientResponse.HttpClientResponse> => {
    switch (errorType) {
      case "timeout":
        return Effect.die(new Error("Request timed out"))

      case "500":
        return Effect.succeed(
          HttpClientResponse.fromWeb(
            request,
            new Response("Internal Server Error", {
              status: 500,
              statusText: "Internal Server Error",
            })
          )
        )

      case "malformed":
        return Effect.succeed(
          HttpClientResponse.fromWeb(
            request,
            new Response("not valid json {{{", {
              status: 200,
              headers: { "Content-Type": "application/json" },
            })
          )
        )
    }
  }

  const mockClient = HttpClient.make(mockExecute)
  return Layer.succeed(HttpClient.HttpClient, mockClient)
}

/**
 * Creates a test layer that simulates network errors for an RPC client.
 */
export function makeRpcNetworkErrorLayer(
  errorType: "timeout" | "500" | "malformed",
  url = "/rpc"
): Layer.Layer<RpcClient.Protocol> {
  const mockHttpLayer = makeMockNetworkErrorLayer(errorType)

  return RpcClient.layerProtocolHttp({ url }).pipe(
    Layer.provide(mockHttpLayer),
    Layer.provide(RpcSerialization.layerJson)
  )
}
