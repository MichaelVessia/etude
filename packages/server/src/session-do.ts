import type { DurableObjectState } from "@cloudflare/workers-types"
import type { NoteEvent, PlayedNote, PieceId, Hand } from "@etude/shared"
import type { MatchResult } from "./services/comparison.js"

/**
 * Serializable version of SessionState for Durable Object storage.
 * Set<number> becomes number[] for JSON serialization.
 */
export interface SerializedSessionState {
  sessionId: string
  pieceId: PieceId
  expectedNotes: NoteEvent[]
  originalNotes: NoteEvent[]
  matchedIndices: number[] // Set serialized as array
  playedNotes: PlayedNote[]
  matchResults: MatchResult[]
  measureStart: number
  measureEnd: number
  hand: Hand
  tempo: number
  startTime: number
  firstNoteOffset: number | null
}

/**
 * Durable Object for persisting session state across worker invocations.
 * Each session gets its own DO instance, keyed by sessionId.
 */
export class SessionDO implements DurableObject {
  private state: DurableObjectState

  constructor(state: DurableObjectState) {
    this.state = state
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname

    try {
      if (request.method === "GET" && path === "/state") {
        const sessionState = await this.state.storage.get<SerializedSessionState>("session")
        return Response.json({ state: sessionState ?? null })
      }

      if (request.method === "PUT" && path === "/state") {
        const body = await request.json() as { state: SerializedSessionState }
        await this.state.storage.put("session", body.state)
        return Response.json({ ok: true })
      }

      if (request.method === "DELETE" && path === "/state") {
        await this.state.storage.delete("session")
        return Response.json({ ok: true })
      }

      return new Response("Not found", { status: 404 })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error"
      return Response.json({ error: message }, { status: 500 })
    }
  }
}

// Type declaration for the DO namespace binding
export interface SessionDONamespace {
  get(id: DurableObjectId): DurableObjectStub
  idFromName(name: string): DurableObjectId
}

// Helper interface for worker env
export interface DurableObject {
  fetch(request: Request): Promise<Response>
}

export interface DurableObjectId {
  toString(): string
}

export interface DurableObjectStub {
  fetch(input: RequestInfo, init?: RequestInit): Promise<Response>
}
