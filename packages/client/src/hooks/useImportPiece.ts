import { useCallback, useState } from "react"
import { Effect, Data } from "effect"
import { useRuntime } from "../runtime/index.js"
import { PieceRpcClient } from "../runtime/PieceRpcClient.js"
import type { ImportPieceResult } from "@etude/shared"

// Import error type
class ImportError extends Data.TaggedError("ImportError")<{
  message: string
}> {}

/**
 * Hook for importing MusicXML pieces to the server.
 * Uses Effect RPC for type-safe communication.
 */
export function useImportPiece() {
  const runtime = useRuntime()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const importPiece = useCallback(
    async (xml: string, filePath: string, id?: string): Promise<ImportPieceResult> => {
      setIsLoading(true)
      setError(null)

      const effect = Effect.gen(function* () {
        const client = yield* PieceRpcClient
        return yield* client.importPiece({
          id: id ?? crypto.randomUUID(),
          xml,
          filePath,
        })
      }).pipe(
        Effect.catchAll((err) =>
          new ImportError({
            message: "message" in err ? String(err.message) : String(err),
          })
        )
      )

      try {
        const result = await runtime.runPromise(effect)
        setIsLoading(false)
        return result
      } catch (err) {
        const message =
          err instanceof ImportError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Import failed"
        setError(message)
        setIsLoading(false)
        throw err
      }
    },
    [runtime]
  )

  return { importPiece, isLoading, error }
}
