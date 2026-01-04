import { Effect } from "effect"
import {
  HttpRouter,
  HttpServerResponse,
  HttpServerRequest,
  HttpApp,
} from "@effect/platform"
import { sessionRoutes } from "./routes/session.js"
import { pieceRoutes } from "./routes/piece.js"

// Add CORS headers to all responses
const addCorsHeaders = <E, R>(app: HttpApp.Default<E, R>): HttpApp.Default<E, R> =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest

    // Handle preflight OPTIONS
    if (request.method === "OPTIONS") {
      return HttpServerResponse.empty({
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Max-Age": "86400",
        },
      })
    }

    const response = yield* app
    return HttpServerResponse.setHeader(response, "Access-Control-Allow-Origin", "*")
  }) as HttpApp.Default<E, R>

// Build router with all routes
export const router = HttpRouter.empty.pipe(
  HttpRouter.get("/health", HttpServerResponse.text("ok")),
  HttpRouter.mount("/api/session", sessionRoutes),
  HttpRouter.mount("/api/piece", pieceRoutes)
)

// Apply CORS to router
export const routerWithCors = addCorsHeaders(router)
