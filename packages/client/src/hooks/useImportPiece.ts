import { useCallback, useState } from "react"
import { Effect, Schema, Data } from "effect"
import { useRuntime } from "../runtime/index.js"
import { ImportPieceResult } from "@etude/shared"

// API base URL - in dev, we use the vite proxy; in prod, same origin
const API_BASE = "/api"

// Import error type
class ImportError extends Data.TaggedError("ImportError")<{
  message: string
}> {}

/**
 * Hook for importing MusicXML pieces to the server.
 * Uses Effect for type-safe error handling.
 */
export function useImportPiece() {
  const runtime = useRuntime()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const importPiece = useCallback(
    async (xml: string, filePath: string, id?: string) => {
      setIsLoading(true)
      setError(null)

      const effect = Effect.gen(function* () {
        const response = yield* Effect.tryPromise({
          try: () =>
            fetch(`${API_BASE}/piece/import`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                id: id ?? crypto.randomUUID(),
                xml,
                filePath,
              }),
            }),
          catch: () => new ImportError({ message: "Network error" }),
        })

        if (!response.ok) {
          const text = yield* Effect.tryPromise({
            try: () => response.text(),
            catch: () => new ImportError({ message: "Failed to read response" }),
          })
          return yield* new ImportError({ message: text || `HTTP ${response.status}` })
        }

        const json = yield* Effect.tryPromise({
          try: () => response.json(),
          catch: () => new ImportError({ message: "Invalid JSON response" }),
        })

        // Check for error response
        if ("error" in json && typeof json.error === "string") {
          return yield* new ImportError({ message: json.error })
        }

        // Parse as ImportPieceResult
        const result = yield* Schema.decodeUnknown(ImportPieceResult)(json).pipe(
          Effect.mapError(() => new ImportError({ message: "Invalid response format" }))
        )

        return result
      })

      try {
        const result = await runtime.runPromise(effect)
        setIsLoading(false)
        return result
      } catch (err) {
        const message = err instanceof ImportError ? err.message : "Import failed"
        setError(message)
        setIsLoading(false)
        throw err
      }
    },
    [runtime]
  )

  return { importPiece, isLoading, error }
}
