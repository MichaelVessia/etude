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
import type { NoteEvent, Hand, Milliseconds } from "@etude/shared"

// Helper: filter notes by measure range
function filterNotesByMeasures(
  notes: NoteEvent[],
  measureStart: number,
  measureEnd: number
): NoteEvent[] {
  return notes.filter((n) => n.measure >= measureStart && n.measure <= measureEnd)
}

// Helper: adjust note timing relative to session start
function adjustNoteTiming(
  notes: NoteEvent[],
  measureStart: number,
  userTempo: number,
  originalTempo: number
): NoteEvent[] {
  const firstNote = notes.find((n) => n.measure >= measureStart)
  const baseTime = firstNote?.startTime ?? 0
  // Scale timing: if original is 120bpm and user wants 100bpm, notes should be 1.2x longer
  const tempoRatio = originalTempo / userTempo

  return notes.map((n) => ({
    ...n,
    startTime: ((n.startTime - baseTime) * tempoRatio) as Milliseconds,
    duration: (n.duration * tempoRatio) as Milliseconds,
  }))
}

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

    // WebSocket upgrade for note stream
    // Path: /api/session/ws/:sessionId
    if (url.pathname.startsWith("/api/session/ws/") && request.headers.get("Upgrade") === "websocket") {
      const sessionId = url.pathname.split("/").pop()
      if (!sessionId) {
        return new Response("Missing session ID", { status: 400 })
      }

      // Forward to Durable Object
      const doId = env.SESSION_DO.idFromName(sessionId)
      const doStub = env.SESSION_DO.get(doId)

      // Forward WebSocket upgrade request to DO
      return doStub.fetch(
        new Request("http://do/ws", {
          headers: request.headers,
        })
      )
    }

    // WebSocket session init - called before connecting WebSocket
    // Path: /api/session/ws/:sessionId/init
    if (url.pathname.match(/^\/api\/session\/ws\/[^/]+\/init$/) && request.method === "POST") {
      const parts = url.pathname.split("/")
      const sessionId = parts[parts.length - 2]
      if (!sessionId) {
        return new Response("Missing session ID", { status: 400 })
      }

      // Forward init request to DO
      const doId = env.SESSION_DO.idFromName(sessionId)
      const doStub = env.SESSION_DO.get(doId)

      const response = await doStub.fetch(
        new Request("http://do/ws/init", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: request.body,
        })
      )

      return addCorsHeaders(response)
    }

    // WebSocket session end - called to end session and get results
    // Path: /api/session/ws/:sessionId/end
    if (url.pathname.match(/^\/api\/session\/ws\/[^/]+\/end$/) && request.method === "POST") {
      const parts = url.pathname.split("/")
      const sessionId = parts[parts.length - 2]
      if (!sessionId) {
        return new Response("Missing session ID", { status: 400 })
      }

      // Forward end request to DO
      const doId = env.SESSION_DO.idFromName(sessionId)
      const doStub = env.SESSION_DO.get(doId)

      const response = await doStub.fetch(new Request("http://do/ws/end", { method: "POST" }))
      return addCorsHeaders(response)
    }

    // WebSocket session start - combines piece lookup + DO init
    // Path: /api/session/ws/start
    if (url.pathname === "/api/session/ws/start" && request.method === "POST") {
      try {
        const body = (await request.json()) as {
          pieceId: string
          measureStart: number
          measureEnd: number
          hand: Hand
          tempo: number
        }

        // Fetch piece notes and default tempo from D1
        const pieceResult = await env.DB.prepare(
          "SELECT notes_json, default_tempo FROM pieces WHERE id = ?"
        )
          .bind(body.pieceId)
          .first<{ notes_json: string; default_tempo: number | null }>()

        if (!pieceResult) {
          return addCorsHeaders(
            Response.json({ error: "Piece not found" }, { status: 404 })
          )
        }

        const allNotes = JSON.parse(pieceResult.notes_json) as NoteEvent[]
        const originalTempo = pieceResult.default_tempo ?? 120 // Default to 120 if not set

        // Filter by measure range
        const filteredNotes = filterNotesByMeasures(allNotes, body.measureStart, body.measureEnd)

        // Filter by hand
        const handFilteredNotes =
          body.hand === "both" ? filteredNotes : filteredNotes.filter((n) => n.hand === body.hand)

        // Adjust timing for tempo
        const expectedNotes = adjustNoteTiming(
          handFilteredNotes,
          body.measureStart,
          body.tempo,
          originalTempo
        )

        // Generate session ID
        const sessionId = crypto.randomUUID()

        // Initialize DO state
        const doId = env.SESSION_DO.idFromName(sessionId)
        const doStub = env.SESSION_DO.get(doId)

        const initResponse = await doStub.fetch(
          new Request("http://do/ws/init", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionId,
              pieceId: body.pieceId,
              expectedNotes,
              originalNotes: handFilteredNotes, // Keep original times for UI mapping
              measureStart: body.measureStart,
              measureEnd: body.measureEnd,
              hand: body.hand,
              tempo: body.tempo,
            }),
          })
        )

        if (!initResponse.ok) {
          const error = await initResponse.text()
          return addCorsHeaders(Response.json({ error }, { status: 500 }))
        }

        // Build WebSocket URL
        const wsProtocol = url.protocol === "https:" ? "wss:" : "ws:"
        const wsUrl = `${wsProtocol}//${url.host}/api/session/ws/${sessionId}`

        return addCorsHeaders(
          Response.json({
            sessionId,
            wsUrl,
            expectedNoteCount: expectedNotes.length,
            measureRange: [body.measureStart, body.measureEnd],
          })
        )
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error"
        return addCorsHeaders(Response.json({ error: message }, { status: 500 }))
      }
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
