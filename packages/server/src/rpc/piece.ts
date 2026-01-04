import { Effect } from "effect"
import {
  PieceRpcs,
  ImportPieceResult,
  PieceNotFound,
  ParseError,
} from "@etude/shared"
import { PieceRepo } from "../repos/piece-repo.js"
import { AttemptRepo } from "../repos/attempt-repo.js"
import { MusicXmlService } from "../services/musicxml.js"

/**
 * RPC handlers for piece management.
 * Implements PieceRpcs from @etude/shared.
 */
export const PieceRpcsLive = PieceRpcs.toLayer(
  Effect.gen(function* () {
    const pieceRepo = yield* PieceRepo
    const attemptRepo = yield* AttemptRepo
    const musicXmlService = yield* MusicXmlService

    return {
      listPieces: () =>
        pieceRepo.list().pipe(
          Effect.catchTag("SqlError", () => Effect.succeed([]))
        ),

      getPiece: ({ id }) =>
        pieceRepo.getById(id).pipe(
          Effect.catchTag("SqlError", () => new PieceNotFound({ id }))
        ),

      getAttempts: ({ pieceId }) =>
        attemptRepo.listByPiece(pieceId).pipe(
          Effect.catchTag("SqlError", () => Effect.succeed([]))
        ),

      getPieceNotes: ({ pieceId }) =>
        pieceRepo.getNotes(pieceId).pipe(
          Effect.catchTag("SqlError", () => new PieceNotFound({ id: pieceId }))
        ),

      importPiece: ({ id, xml, filePath }) =>
        Effect.gen(function* () {
          // Check if piece already exists
          const existing = yield* pieceRepo.getByFilePath(filePath)
          if (existing) {
            const notes = yield* pieceRepo.getNotes(existing.id).pipe(
              Effect.catchAll(() => Effect.succeed([]))
            )
            return new ImportPieceResult({
              id: existing.id,
              name: existing.name,
              totalMeasures: existing.totalMeasures,
              noteCount: notes.length,
              alreadyExists: true,
            })
          }

          // Parse the MusicXML
          const parsed = yield* musicXmlService.parse(xml, filePath).pipe(
            Effect.mapError(
              (err) =>
                new ParseError({
                  reason: "MalformedXml",
                  details: String(err),
                  filePath,
                })
            )
          )

          // Create piece in database
          const piece = yield* pieceRepo.create({
            id,
            name: parsed.name,
            composer: parsed.composer,
            filePath,
            totalMeasures: parsed.totalMeasures,
            difficulty: null,
            notesJson: JSON.stringify(parsed.notes),
            defaultTempo: parsed.defaultTempo,
          })

          return new ImportPieceResult({
            id: piece.id,
            name: piece.name,
            totalMeasures: piece.totalMeasures,
            noteCount: parsed.notes.length,
            alreadyExists: false,
          })
        }).pipe(
          Effect.catchTag("SqlError", (err) =>
            new ParseError({
              reason: "MalformedXml",
              details: `Database error: ${err.message}`,
              filePath,
            })
          )
        ),
    }
  })
)
