import type { D1Database, Fetcher } from "@cloudflare/workers-types"
import { HttpApp } from "@effect/platform"
import { Layer, pipe } from "effect"
import { makeD1Layer } from "./sql-d1.js"
import { router } from "./api/server.js"
import { SessionServiceImpl } from "./services/session.js"
import { SessionStateStore, makeDOSessionStateStore } from "./services/session-state-store.js"
import { ComparisonServiceLive } from "./services/comparison.js"
import { MusicXmlServiceLive } from "./services/musicxml.js"
import { PieceRepoLive } from "./repos/piece-repo.js"
import { AttemptRepoLive } from "./repos/attempt-repo.js"
import type { SessionDONamespace } from "./session-do.js"

// Re-export Durable Object for Cloudflare
export { SessionDO } from "./session-do.js"

/**
 * Worker environment bindings from Cloudflare.
 */
interface Env {
  DB: D1Database
  SESSION_DO: SessionDONamespace
  ASSETS: Fetcher
}

// CORS headers for API responses
function addCorsHeaders(response: Response): Response {
  const headers = new Headers(response.headers)
  headers.set("Access-Control-Allow-Origin", "*")
  headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization")
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Max-Age": "86400",
        },
      })
    }

    // Health check
    if (url.pathname === "/health") {
      return new Response("ok")
    }

    // API routes - handled by Effect
    if (url.pathname.startsWith("/api/")) {
      try {
        // Get or create session DO stub
        // Use a fixed session ID for now (single user mode)
        // In production, this could be derived from auth session
        const sessionId = "default-session"
        const doId = env.SESSION_DO.idFromName(sessionId)
        const doStub = env.SESSION_DO.get(doId)

        // Create the session state store from DO stub
        const sessionStateStore = makeDOSessionStateStore(doStub)

        // Build layers with D1 and DO-backed session
        const SqlLive = makeD1Layer(env.DB)

        const RepoLayer = Layer.mergeAll(PieceRepoLive, AttemptRepoLive)

        const SessionStateStoreLive = Layer.succeed(SessionStateStore, sessionStateStore)

        const SessionLayer = pipe(
          SessionServiceImpl,
          Layer.provide(RepoLayer),
          Layer.provide(ComparisonServiceLive),
          Layer.provide(SessionStateStoreLive)
        )

        const AppLayer = pipe(
          Layer.mergeAll(SessionLayer, ComparisonServiceLive, MusicXmlServiceLive, RepoLayer),
          Layer.provide(SqlLive)
        )

        // Create web handler from Effect router
        const webHandler = HttpApp.toWebHandlerLayer(router, AppLayer)

        // Handle the request
        const response = await webHandler.handler(request)
        return addCorsHeaders(response)
      } catch (error) {
        console.error("API error:", error)
        const message = error instanceof Error ? error.message : "Unknown error"
        return addCorsHeaders(
          new Response(JSON.stringify({ error: message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          })
        )
      }
    }

    // Static assets - served by ASSETS binding
    // @ts-expect-error Cloudflare workers-types Request/Response differ from standard Web APIs
    return env.ASSETS.fetch(request)
  },
}
