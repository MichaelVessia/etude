import { describe, expect, it } from "@codeforbreakfast/bun-test-effect"
import { Effect, Exit } from "effect"
import { HttpRouter } from "@effect/platform"
import {
  makeRequest,
  runRequest,
  runRequestWithCors,
} from "./helpers/test-http.js"

describe("Server", () => {
  describe("Health check", () => {
    it.effect("GET /health returns ok", () =>
      Effect.gen(function* () {
        const request = makeRequest("GET", "/health")
        const response = yield* runRequest(request)

        expect(response.status).toBe(200)
        // Check body content
        const body = response.body
        if (body._tag === "Uint8Array") {
          const text = new TextDecoder().decode(body.body)
          expect(text).toBe("ok")
        }
      })
    )
  })

  describe("CORS", () => {
    it.effect("adds CORS headers to responses", () =>
      Effect.gen(function* () {
        const request = makeRequest("GET", "/health")
        const response = yield* runRequestWithCors(request)

        expect(response.status).toBe(200)
        expect(response.headers["access-control-allow-origin"]).toBe("*")
      })
    )

    it.effect("OPTIONS preflight returns 204 with CORS headers", () =>
      Effect.gen(function* () {
        const request = makeRequest("OPTIONS", "/api/session/state")
        const response = yield* runRequestWithCors(request)

        expect(response.status).toBe(204)
        expect(response.headers["access-control-allow-origin"]).toBe("*")
        expect(response.headers["access-control-allow-methods"]).toBe(
          "GET, POST, PUT, DELETE, OPTIONS"
        )
        expect(response.headers["access-control-allow-headers"]).toBe(
          "Content-Type, Authorization"
        )
        expect(response.headers["access-control-max-age"]).toBe("86400")
      })
    )
  })

  describe("Error handling", () => {
    it.effect("unknown routes fail with RouteNotFound", () =>
      Effect.gen(function* () {
        const request = makeRequest("GET", "/unknown/route")
        const exit = yield* runRequest(request).pipe(Effect.exit)

        expect(Exit.isFailure(exit)).toBe(true)
        if (Exit.isFailure(exit)) {
          const error = exit.cause
          // RouteNotFound is the expected error for unknown routes
          expect(error._tag).toBe("Fail")
          if (error._tag === "Fail") {
            expect(error.error._tag).toBe("RouteNotFound")
            expect((error.error as HttpRouter.RouteNotFound).request.url).toBe(
              "/unknown/route"
            )
          }
        }
      })
    )
  })
})
