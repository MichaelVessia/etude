# WebSocket Note Stream Migration

Migrate note submission from HTTP POST to Durable Object WebSocket for real-time performance and correctness.

## Problem

Current implementation uses HTTP POST per note:
```
Client → POST /api/session/note → Worker → DO.get() → process → DO.set() → Response
```

Issues:
1. **2 DO operations per note** - get + set on every note played
2. **Race conditions** - HTTP requests can arrive out of order
3. **Latency** - full request/response cycle per note
4. **No server push** - can't send disconnect warnings, timeouts

## Solution

Keep HTTP for session lifecycle, use WebSocket for note stream:

```
Session start:  POST /api/session/start → creates DO, returns session info
Note stream:    WebSocket → DO (state in memory, no storage reads per note)
Session end:    POST /api/session/end → persists to D1, closes WebSocket
```

## Architecture

### Current Flow
```
┌────────┐   HTTP    ┌────────┐   HTTP    ┌────────────┐   storage   ┌─────┐
│ Client │ ────────→ │ Worker │ ────────→ │ SessionDO  │ ←─────────→ │ D1  │
└────────┘  per note └────────┘           └────────────┘  per note   └─────┘
```

### New Flow
```
┌────────┐  HTTP start  ┌────────┐  creates   ┌────────────┐
│ Client │ ───────────→ │ Worker │ ─────────→ │ SessionDO  │
└────────┘              └────────┘            └────────────┘
    │                                               │
    │  WebSocket (upgrade)                          │
    └───────────────────────────────────────────────┘
           │                                   │
           │  note events (bidirectional)      │  state in memory
           │  ←─────────────────────────────→  │  (no storage per note)
           │                                   │
    ┌──────┴──────┐                      ┌─────┴─────┐
    │ HTTP end    │ ───────────────────→ │ persist   │ → D1
    └─────────────┘                      └───────────┘
```

## Decisions

### Connection Management

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Reconnection on disconnect | **No recovery** | Session fails immediately. User restarts. Simpler. |
| Partial data on disconnect | **Discard all** | No partial results persisted. Clean failure. |
| Tab abandonment | **Discard** | No auto-save. If user didn't call /end, session doesn't count. |
| Session timeout | **None** | No idle timeout. User controls session end. |
| Multiple tabs | **Block second** | Reject WebSocket if session already has connection. |
| Hibernation | **No** | Use WebSocketPair (cheaper). Session dies if DO evicted. |

### Protocol

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Message format | **JSON** | Human-readable, easy debugging. |
| Message discriminator | **Type field** | `{type: 'note'}`, `{type: 'ping'}`, etc. Extensible. |
| Client timestamp | **performance.now()** | High-resolution monotonic clock. |
| Session start time | **Client tracks** | Client captures timestamp at session start. |
| Heartbeat | **Server-initiated** | Server sends ping every 30s. Client responds pong. |
| Connect acknowledgement | **Send ready msg** | Server sends `{type: 'ready', sessionId}` after upgrade. |
| Session end message | **Send summary** | Server sends `{type: 'sessionEnd', score: {...}}` before close. |

### Authentication

| Decision | Choice | Rationale |
|----------|--------|-----------|
| WS auth | **Session cookie** | Same-origin (etude.vessia.net serves both). Simplest. |
| User identity | **Future auth** | Anonymous now. Add nullable userId to schema for later. |

### Error Handling

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Connection failure | **Toast + retry** | Auto-retry 3 times, then show error message. |
| HTTP fallback | **WebSocket only** | No dual codepaths. WS fails = session fails. |
| Server malformed msg | **Log + ignore** | console.error, continue session. Graceful. |
| Server error messages | **All recoverable** | Send `{type: 'error'}` for any non-fatal error. |

### Client UX

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Note result feedback | **Immediate** | Update UI on every note result. No batching. |
| Pending indicator | **None** | Just show result when received. No optimistic state. |
| Live score during play | **None** | Removed from scope. |
| WS close responsibility | **Server closes** | Server closes after /end. Client waits for onclose. |
| /end timing | **Immediate** | Process /end immediately. In-flight notes after /end dropped. |

### Development

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Local dev server | **Miniflare only** | Delete main.ts. One codepath everywhere. |
| Integration tests | **Real Miniflare** | Actually connect WS to Miniflare. Slower but realistic. |
| Commit strategy | **Atomic commits** | Committing directly to master. Each phase as atomic commit. |

## WebSocket Message Protocol

### Client → Server

```typescript
// Note played
{
  type: "note"
  pitch: number       // MIDI note number 0-127
  velocity: number    // MIDI velocity 0-127
  timestamp: number   // ms since session start (performance.now() based)
  on: boolean         // true = noteOn, false = noteOff
}

// Heartbeat response
{
  type: "pong"
}
```

### Server → Client

```typescript
// Connection ready
{
  type: "ready"
  sessionId: string
}

// Note result
{
  type: "result"
  pitch: number
  result: "correct" | "early" | "late" | "extra" | "missed"
  timingOffset: number        // ms from expected time (negative = early)
  expectedNoteTime: number | null
}

// Recoverable error
{
  type: "error"
  message: string
  recoverable: true
}

// Heartbeat
{
  type: "ping"
}

// Session complete (sent before server closes socket)
{
  type: "sessionEnd"
  score: {
    correct: number
    early: number
    late: number
    extra: number
    missed: number
    accuracy: number
  }
}
```

## Schema Changes

Add nullable `userId` to attempts table for future auth:

```sql
ALTER TABLE attempts ADD COLUMN user_id TEXT;
```

## Implementation

### 1. SessionDO WebSocket Handler

```typescript
// packages/server/src/session-do.ts

export class SessionDO implements DurableObject {
  private state: DurableObjectState
  private activeWebSocket: WebSocket | null = null
  private sessionState: SessionState | null = null
  private pingInterval: number | null = null

  constructor(state: DurableObjectState) {
    this.state = state
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    // WebSocket upgrade for note stream
    if (url.pathname === "/ws" && request.headers.get("Upgrade") === "websocket") {
      return this.handleWebSocket(request)
    }

    // HTTP endpoints for start/end
    if (url.pathname === "/start" && request.method === "POST") {
      return this.handleStart(request)
    }

    if (url.pathname === "/end" && request.method === "POST") {
      return this.handleEnd(request)
    }

    return new Response("Not found", { status: 404 })
  }

  private handleWebSocket(request: Request): Response {
    // Block if session already has active connection
    if (this.activeWebSocket) {
      return new Response("Session already has active connection", { status: 409 })
    }

    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)

    server.accept()
    this.activeWebSocket = server

    // Send ready message
    server.send(JSON.stringify({ type: "ready", sessionId: this.sessionState?.id }))

    // Start server-initiated heartbeat
    this.pingInterval = setInterval(() => {
      if (server.readyState === WebSocket.OPEN) {
        server.send(JSON.stringify({ type: "ping" }))
      }
    }, 30000)

    server.addEventListener("message", (event) => {
      const data = JSON.parse(event.data as string)

      if (data.type === "note") {
        const result = this.processNote(data)
        server.send(JSON.stringify({ type: "result", ...result }))
      } else if (data.type === "pong") {
        // Heartbeat response, connection alive
      }
    })

    server.addEventListener("close", () => {
      this.cleanup()
    })

    server.addEventListener("error", () => {
      this.cleanup()
    })

    return new Response(null, { status: 101, webSocket: client })
  }

  private cleanup() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval)
      this.pingInterval = null
    }
    this.activeWebSocket = null
    this.sessionState = null  // Discard session on disconnect
  }

  private processNote(note: { pitch: number; velocity: number; timestamp: number; on: boolean }): NoteResult {
    if (!this.sessionState) {
      return { pitch: note.pitch, result: "extra", timingOffset: 0, expectedNoteTime: null }
    }

    // Process note against expected - all in memory, no storage calls
    // ... (same logic as current submitNote, but mutates in-memory state)
  }

  private async handleStart(request: Request): Promise<Response> {
    // Create session state, store in memory
    // Return session ID for WebSocket connection
  }

  private async handleEnd(request: Request): Promise<Response> {
    // Send summary before closing
    if (this.activeWebSocket?.readyState === WebSocket.OPEN) {
      const score = this.calculateScore()
      this.activeWebSocket.send(JSON.stringify({ type: "sessionEnd", score }))
      this.activeWebSocket.close()
    }

    // Calculate final scores
    // Persist attempt to D1
    // Clear session state
    this.cleanup()
  }
}
```

### 2. Worker Routes

```typescript
// packages/server/src/worker.ts

// POST /api/session/start - creates session, returns WS URL
if (url.pathname === "/api/session/start" && request.method === "POST") {
  const body = await request.json()
  const sessionId = crypto.randomUUID()
  const doId = env.SESSION_DO.idFromName(sessionId)
  const stub = env.SESSION_DO.get(doId)

  const response = await stub.fetch(new Request("http://do/start", {
    method: "POST",
    body: JSON.stringify(body),
  }))

  const result = await response.json()

  // Return WebSocket URL for note stream
  return Response.json({
    ...result,
    wsUrl: `wss://${url.host}/api/session/ws/${sessionId}`,
  })
}

// WebSocket upgrade for notes
if (url.pathname.startsWith("/api/session/ws/")) {
  const sessionId = url.pathname.split("/").pop()
  const doId = env.SESSION_DO.idFromName(sessionId)
  const stub = env.SESSION_DO.get(doId)

  // Forward WebSocket to Durable Object
  return stub.fetch(new Request("http://do/ws", {
    headers: request.headers,
  }))
}
```

### 3. Client WebSocket Hook

```typescript
// packages/client/src/hooks/useNoteStream.ts

export function useNoteStream(wsUrl: string | null) {
  const wsRef = useRef<WebSocket | null>(null)
  const [connected, setConnected] = useState(false)
  const [ready, setReady] = useState(false)
  const [lastResult, setLastResult] = useState<NoteResult | null>(null)
  const [sessionScore, setSessionScore] = useState<SessionScore | null>(null)
  const retryCount = useRef(0)
  const maxRetries = 3

  useEffect(() => {
    if (!wsUrl) return

    const connect = () => {
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        setConnected(true)
        retryCount.current = 0
      }

      ws.onclose = () => {
        setConnected(false)
        setReady(false)
      }

      ws.onerror = (e) => {
        console.error("WebSocket error:", e)
        if (retryCount.current < maxRetries) {
          retryCount.current++
          setTimeout(connect, 1000 * retryCount.current)
        } else {
          // Show toast: "Connection failed. Check your connection."
        }
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)

          switch (data.type) {
            case "ready":
              setReady(true)
              break
            case "result":
              setLastResult(data)
              break
            case "sessionEnd":
              setSessionScore(data.score)
              break
            case "ping":
              ws.send(JSON.stringify({ type: "pong" }))
              break
            case "error":
              console.error("Server error:", data.message)
              // Could show toast for recoverable errors
              break
            default:
              console.error("Unknown message type:", data.type)
          }
        } catch (e) {
          console.error("Failed to parse WebSocket message:", e)
          // Log + ignore per spec
        }
      }
    }

    connect()

    return () => wsRef.current?.close()
  }, [wsUrl])

  const sendNote = useCallback((pitch: number, velocity: number, timestamp: number, on: boolean) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "note", pitch, velocity, timestamp, on }))
    }
  }, [])

  return { connected, ready, sendNote, lastResult, sessionScore }
}
```

### 4. Updated useSession

```typescript
// packages/client/src/hooks/useSession.ts

export function useSession() {
  const [wsUrl, setWsUrl] = useState<string | null>(null)
  const sessionStartTime = useRef<number>(0)
  const { connected, ready, sendNote, lastResult, sessionScore } = useNoteStream(wsUrl)

  const startSession = async (params: SessionStartParams) => {
    const response = await fetch(`${API}/session/start`, {
      method: "POST",
      body: JSON.stringify(params),
    })
    const data = await response.json()

    // Record session start time for timestamp calculation
    sessionStartTime.current = performance.now()

    // Connect WebSocket for notes
    setWsUrl(data.wsUrl)

    return data
  }

  const submitNote = (pitch: number, velocity: number, on: boolean) => {
    const timestamp = performance.now() - sessionStartTime.current
    sendNote(pitch, velocity, timestamp, on)
  }

  // ... rest of hook
}
```

## Local Development

Use Alchemy's `--dev` flag which runs Miniflare locally:

```bash
# Start local dev with Miniflare (simulates Workers + DO + D1 + WebSocket)
ALCHEMY_STAGE=dev bun run alchemy.run.ts --dev

# Client connects to Miniflare URL
VITE_API_URL=http://localhost:8787 bun run --cwd packages/client dev
```

Miniflare supports:
- Durable Objects with WebSocket
- D1 (SQLite-backed locally)
- Same code path as production

## Migration Plan

### Phase 1: Add WebSocket to DO (parallel to HTTP)
- Add WebSocket handler to SessionDO
- Add `/ws` routing to Worker
- Keep existing HTTP `/note` endpoint working
- Test WebSocket path with Miniflare
- **Atomic commit**

### Phase 2: Update Client
- Add `useNoteStream` hook
- Update `useSession` to use WebSocket
- Add retry logic and error handling
- **Atomic commit**

### Phase 3: Remove HTTP Note Endpoint + Bun Server
- Remove `POST /api/session/note`
- Remove `submitNote` HTTP handler
- Remove `packages/server/src/main.ts`
- Remove `packages/server/src/sql.ts`
- Remove `LocalSessionStateStoreLive`
- **Atomic commit**

## Benefits

| Aspect | Before (HTTP) | After (WebSocket) |
|--------|--------------|-------------------|
| DO ops per note | 2 (get + set) | 0 (in memory) |
| Request order | Not guaranteed | Guaranteed (single connection) |
| Latency | Full HTTP cycle | Message on existing connection |
| Server push | Impossible | Supported |
| Code path | Different local/prod | Same everywhere |

## Testing

### Unit Tests
- WebSocket message parsing
- Note matching logic (unchanged)
- Session state management

### Integration Tests (Real Miniflare)
- WebSocket connection lifecycle
- Note stream through DO
- Session persistence on end
- Heartbeat/ping-pong
- Multi-tab blocking
- Retry on connection failure

### Manual Testing
```bash
# 1. Start Miniflare
ALCHEMY_STAGE=dev bun run alchemy.run.ts --dev

# 2. Start client
VITE_API_URL=http://localhost:8787 bun run --cwd packages/client dev

# 3. Test full flow with MIDI keyboard
```
