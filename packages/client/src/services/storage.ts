import { Context, Effect, Layer } from "effect"

/**
 * StorageService provides Effect-based access to localStorage.
 * Used for persisting user preferences like MIDI device selection.
 */
export interface StorageService {
  readonly get: (key: string) => Effect.Effect<string | null>
  readonly set: (key: string, value: string) => Effect.Effect<void>
  readonly remove: (key: string) => Effect.Effect<void>
}

export const StorageService = Context.GenericTag<StorageService>("StorageService")

/**
 * Live implementation using browser localStorage.
 */
export const StorageServiceLive = Layer.succeed(
  StorageService,
  StorageService.of({
    get: (key: string) =>
      Effect.sync(() => {
        try {
          return localStorage.getItem(key)
        } catch {
          return null
        }
      }),
    set: (key: string, value: string) =>
      Effect.sync(() => {
        try {
          localStorage.setItem(key, value)
        } catch {
          // Ignore storage errors (e.g., quota exceeded, private browsing)
        }
      }),
    remove: (key: string) =>
      Effect.sync(() => {
        try {
          localStorage.removeItem(key)
        } catch {
          // Ignore storage errors
        }
      }),
  })
)
