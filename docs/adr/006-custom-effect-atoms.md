# ADR 006: Custom Effect Atoms for Client State

## Status

Accepted

## Context

Etude's React frontend needs to manage:

- Session state (current piece, practice settings, WebSocket connection)
- UI state (selected measures, tempo, hand filter)
- Async data (pieces list, practice history)

The backend uses Effect extensively. The question: how should the frontend manage state while maintaining Effect integration?

### Alternatives Considered

**1. React useState/useReducer Only**

Standard React state management with hooks.

Problems:
- No integration with Effect's runtime (would need to bridge constantly)
- Complex state updates require manual reducer logic
- Sharing state between components requires prop drilling or context
- Async state (loading, error, data) needs manual handling

**2. Jotai**

Atomic state management library, conceptually similar to what we need.

Problems:
- Separate primitive from Effect; need to bridge between Jotai atoms and Effect
- Jotai's async atoms have different semantics than Effect
- Would have two mental models: Jotai for UI state, Effect for backend calls
- No compile-time integration with Effect's error types

**3. Zustand/Redux**

Global store with actions and selectors.

Problems:
- Overkill for this application's state complexity
- Same bridging issues as Jotai
- Redux especially verbose for simple state updates

**4. TanStack Query for Async, useState for UI**

Use React Query for server state, local state for UI.

Problems:
- React Query has its own caching/invalidation model
- Still need to bridge Effect calls into React Query's promise-based API
- Two caching layers (React Query + any Effect caching) could conflict

## Decision

Create a custom `Atom` abstraction built on Effect's `SubscriptionRef`:

```typescript
// runtime/Atom.ts
export interface Atom<A> {
  readonly ref: SubscriptionRef.SubscriptionRef<A>
  readonly get: Effect.Effect<A>
  readonly set: (value: A) => Effect.Effect<void>
  readonly update: (f: (value: A) => A) => Effect.Effect<void>
}

export const make = <A>(initial: A): Effect.Effect<Atom<A>> =>
  Effect.gen(function* () {
    const ref = yield* SubscriptionRef.make(initial)
    return {
      ref,
      get: SubscriptionRef.get(ref),
      set: (value) => SubscriptionRef.set(ref, value),
      update: (f) => SubscriptionRef.update(ref, f),
    }
  })
```

Bridge to React via `useSyncExternalStore`:

```typescript
// hooks/useAtom.ts
export const useAtomValue = <A>(atom: Atom<A>): A => {
  const runtime = useRuntime()

  return useSyncExternalStore(
    (callback) => {
      // Subscribe to SubscriptionRef changes
      const fiber = runtime.runFork(
        Stream.runForEach(atom.ref.changes, () => Effect.sync(callback))
      )
      return () => runtime.runFork(Fiber.interrupt(fiber))
    },
    () => runtime.runSync(atom.get)
  )
}
```

Atoms are created in the app's Effect layer and accessed via context:

```typescript
// runtime/AppRuntime.tsx
const SessionAtom = Context.Tag<Atom<SessionState>>()

const SessionAtomLive = Layer.effect(
  SessionAtom,
  Atom.make(initialSessionState)
)
```

## Consequences

### Positive

- **Unified model**: All state operations are Effects; no mental context switching
- **Type-safe throughout**: Effect's type system tracks state types and errors
- **Testable**: Atoms can be provided via layers in tests
- **Reactive**: SubscriptionRef provides built-in change notifications
- **Composable**: Can derive computed state using Effect combinators

### Negative

- **Custom abstraction**: Not a well-known library; requires documentation
- **Maintenance burden**: Must maintain Atom implementation ourselves
- **Ecosystem gap**: No DevTools, no community plugins, no middleware ecosystem
- **Learning curve**: Developers must understand SubscriptionRef and Effect layers
- **React integration complexity**: useSyncExternalStore bridging is non-trivial

### Neutral

- Small API surface (get, set, update) is easy to learn
- Could migrate to Jotai + Effect bridge later if needed
- Pattern is similar enough to Jotai that concepts transfer
