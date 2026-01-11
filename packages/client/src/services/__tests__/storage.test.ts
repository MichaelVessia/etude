import { describe, expect, it, beforeEach } from "@codeforbreakfast/bun-test-effect"
import { Effect, Layer } from "effect"
import { StorageService, StorageServiceLive } from "../storage.js"

describe("StorageService", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  describe("get", () => {
    it.effect("returns null for non-existent key", () =>
      Effect.gen(function* () {
        const storage = yield* StorageService
        const result = yield* storage.get("nonexistent")
        expect(result).toBeNull()
      }).pipe(Effect.provide(StorageServiceLive))
    )

    it.effect("returns stored value for existing key", () =>
      Effect.gen(function* () {
        localStorage.setItem("test-key", "test-value")
        const storage = yield* StorageService
        const result = yield* storage.get("test-key")
        expect(result).toBe("test-value")
      }).pipe(Effect.provide(StorageServiceLive))
    )
  })

  describe("set", () => {
    it.effect("stores value in localStorage", () =>
      Effect.gen(function* () {
        const storage = yield* StorageService
        yield* storage.set("my-key", "my-value")
        expect(localStorage.getItem("my-key")).toBe("my-value")
      }).pipe(Effect.provide(StorageServiceLive))
    )

    it.effect("overwrites existing value", () =>
      Effect.gen(function* () {
        localStorage.setItem("existing", "old")
        const storage = yield* StorageService
        yield* storage.set("existing", "new")
        expect(localStorage.getItem("existing")).toBe("new")
      }).pipe(Effect.provide(StorageServiceLive))
    )
  })

  describe("remove", () => {
    it.effect("removes key from localStorage", () =>
      Effect.gen(function* () {
        localStorage.setItem("to-remove", "value")
        const storage = yield* StorageService
        yield* storage.remove("to-remove")
        expect(localStorage.getItem("to-remove")).toBeNull()
      }).pipe(Effect.provide(StorageServiceLive))
    )

    it.effect("does nothing for non-existent key", () =>
      Effect.gen(function* () {
        const storage = yield* StorageService
        yield* storage.remove("never-existed")
        // Should not throw
        expect(localStorage.getItem("never-existed")).toBeNull()
      }).pipe(Effect.provide(StorageServiceLive))
    )
  })

  describe("round-trip", () => {
    it.effect("can set, get, and remove a value", () =>
      Effect.gen(function* () {
        const storage = yield* StorageService

        // Initially null
        const initial = yield* storage.get("round-trip")
        expect(initial).toBeNull()

        // Set value
        yield* storage.set("round-trip", "stored")
        const afterSet = yield* storage.get("round-trip")
        expect(afterSet).toBe("stored")

        // Remove value
        yield* storage.remove("round-trip")
        const afterRemove = yield* storage.get("round-trip")
        expect(afterRemove).toBeNull()
      }).pipe(Effect.provide(StorageServiceLive))
    )
  })

  describe("test layer", () => {
    it.effect("can use a mock implementation for testing", () =>
      Effect.gen(function* () {
        const storage = yield* StorageService
        const result = yield* storage.get("any-key")
        expect(result).toBe("always-this")
      }).pipe(
        Effect.provide(
          Layer.succeed(
            StorageService,
            StorageService.of({
              get: () => Effect.succeed("always-this"),
              set: () => Effect.void,
              remove: () => Effect.void,
            })
          )
        )
      )
    )
  })
})
