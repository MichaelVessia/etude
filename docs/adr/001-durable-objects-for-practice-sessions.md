# ADR 001: Use Cloudflare Durable Objects for Practice Sessions

## Status

Accepted

## Context

Etude's practice mode requires real-time processing of MIDI note events. When a user plays a note on their piano, the system must:

1. Receive the note event via WebSocket
2. Match it against expected notes from the sheet music
3. Track which notes have been matched (to avoid double-matching)
4. Calculate timing accuracy
5. Return immediate feedback to the client

This creates several technical requirements:

- **Persistent WebSocket connections**: The server must hold a connection open for the duration of a practice session (potentially minutes)
- **In-memory state**: Rapid note events (potentially 10+ per second in fast passages) require low-latency state access
- **Consistency**: Note matching must be deterministic—the same note can't be matched twice
- **Session isolation**: Each user's practice session must be independent

### Alternatives Considered

**1. Stateless Workers + External Database (D1/KV)**

Workers handle each request independently. State would be stored in D1 or KV.

Problems:
- Workers cannot hold WebSocket connections (they terminate after request completion)
- Database round-trip for every note event adds unacceptable latency
- KV has eventual consistency, unsuitable for real-time state mutations

**2. Stateless Workers + Client-Side Matching**

Move all note matching logic to the client. Server only stores final results.

Problems:
- Easy to manipulate/cheat scores
- Duplicated logic between client and server
- No authoritative source of truth during practice

**3. External WebSocket Service**

Use a third-party WebSocket service (Pusher, Ably) with Workers for HTTP.

Problems:
- Added complexity and cost
- Still need somewhere to run matching logic with state
- Latency from extra network hops

## Decision

Use Cloudflare Durable Objects to manage practice sessions.

Each practice session maps to a single Durable Object instance identified by session ID:

```typescript
const doId = env.SESSION_DO.idFromName(sessionId)
const doStub = env.SESSION_DO.get(doId)
```

The DO:
- Accepts and holds the WebSocket connection
- Maintains session state in memory during practice
- Processes note events and returns match results
- Persists state to DO storage for recovery if evicted

## Consequences

### Positive

- **Low latency**: State lives in memory within the DO; no database round-trips during practice
- **WebSocket support**: DOs natively support holding WebSocket connections
- **Single-threaded actor model**: One DO instance per session guarantees no race conditions
- **Automatic persistence**: DO storage provides durability without explicit database management
- **Geographic affinity**: DO runs close to the user after first access

### Negative

- **Cloudflare lock-in**: Durable Objects are Cloudflare-specific; migration would require architectural changes
- **Cold start latency**: First request to an evicted DO incurs storage read (~50-100ms)
- **Cost**: DOs have separate pricing from Workers (duration-based billing while WebSocket is open)
- **Complexity**: Two execution contexts (Worker for routing, DO for sessions) vs single Worker

### Neutral

- State must be serializable for DO storage backup
- Need to handle DO eviction/recovery edge cases
