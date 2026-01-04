import { useCallback, useSyncExternalStore } from "react"
import { Effect, SubscriptionRef, Stream, Fiber } from "effect"
import { useRuntime } from "./AppRuntime.js"

/**
 * An Atom is a reactive state container backed by Effect's SubscriptionRef.
 * It provides a simple interface for React components to subscribe to state changes.
 */
export interface Atom<A> {
  readonly ref: SubscriptionRef.SubscriptionRef<A>
  readonly get: Effect.Effect<A>
  readonly set: (value: A) => Effect.Effect<void>
  readonly update: (f: (value: A) => A) => Effect.Effect<void>
}

/**
 * Create an Atom with an initial value.
 * Returns an Effect that yields the Atom.
 */
export const makeAtom = <A>(initial: A): Effect.Effect<Atom<A>> =>
  Effect.gen(function* () {
    const ref = yield* SubscriptionRef.make(initial)

    return {
      ref,
      get: SubscriptionRef.get(ref),
      set: (value: A) => SubscriptionRef.set(ref, value),
      update: (f: (value: A) => A) => SubscriptionRef.update(ref, f),
    }
  })

/**
 * Hook to use an Atom in a React component.
 * Subscribes to changes and triggers re-renders when the value changes.
 *
 * @param atom - The Atom to subscribe to
 * @returns A tuple of [currentValue, setValue, updateValue]
 */
export function useAtom<A>(atom: Atom<A>): readonly [A, (value: A) => void, (f: (value: A) => A) => void] {
  const runtime = useRuntime()

  // Get the current value synchronously (for initial render and getSnapshot)
  const getSnapshot = useCallback(() => {
    return runtime.runSync(atom.get)
  }, [runtime, atom])

  // Subscribe to changes
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      // Fork a fiber that listens to changes and calls onStoreChange
      const fiber = runtime.runFork(
        Stream.runForEach(
          // Skip the first value (we already have it from getSnapshot)
          Stream.drop(atom.ref.changes, 1),
          () => Effect.sync(onStoreChange)
        )
      )

      // Return unsubscribe function
      return () => {
        runtime.runFork(Fiber.interrupt(fiber))
      }
    },
    [runtime, atom]
  )

  const value = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  const setValue = useCallback(
    (newValue: A) => {
      runtime.runFork(atom.set(newValue))
    },
    [runtime, atom]
  )

  const updateValue = useCallback(
    (f: (value: A) => A) => {
      runtime.runFork(atom.update(f))
    },
    [runtime, atom]
  )

  return [value, setValue, updateValue] as const
}

/**
 * Hook to read an Atom's value without the ability to modify it.
 *
 * @param atom - The Atom to read from
 * @returns The current value
 */
export function useAtomValue<A>(atom: Atom<A>): A {
  const [value] = useAtom(atom)
  return value
}
