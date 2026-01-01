import { Effect, Schema } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "@effect/platform"
import { PieceRepo } from "../../repos/piece-repo.js"
import { MusicXmlService } from "../../services/musicxml.js"

// Request schemas
const ImportPieceRequest = Schema.Struct({
  id: Schema.String,
  xml: Schema.String,
  filePath: Schema.String,
})

// POST /import - Import a piece from MusicXML
const importPiece = Effect.gen(function* () {
  const req = yield* HttpServerRequest.HttpServerRequest
  const body = yield* req.json
  const parsed = yield* Schema.decodeUnknown(ImportPieceRequest)(body)
  const pieceRepo = yield* PieceRepo
  const musicXmlService = yield* MusicXmlService

  // Check if piece already exists
  const existing = yield* pieceRepo.getByFilePath(parsed.filePath)
  if (existing) {
    return yield* HttpServerResponse.json({
      id: existing.id,
      name: existing.name,
      totalMeasures: existing.totalMeasures,
      alreadyExists: true,
    })
  }

  // Parse the MusicXML
  const parsedPiece = yield* musicXmlService.parse(parsed.xml, parsed.filePath)

  // Create the piece in database
  const piece = yield* pieceRepo.create({
    name: parsedPiece.name,
    composer: parsedPiece.composer,
    filePath: parsed.filePath,
    totalMeasures: parsedPiece.totalMeasures,
    difficulty: null,
    notesJson: JSON.stringify(parsedPiece.notes),
  })

  return yield* HttpServerResponse.json({
    id: piece.id,
    name: piece.name,
    totalMeasures: piece.totalMeasures,
    noteCount: parsedPiece.notes.length,
  })
}).pipe(
  Effect.catchAll((error) =>
    HttpServerResponse.json({ error: String(error) }, { status: 400 })
  )
)

// GET /list - List all pieces
const listPieces = Effect.gen(function* () {
  const pieceRepo = yield* PieceRepo
  const pieces = yield* pieceRepo.list()

  return yield* HttpServerResponse.json(
    pieces.map((p) => ({
      id: p.id,
      name: p.name,
      totalMeasures: p.totalMeasures,
    }))
  )
}).pipe(
  Effect.catchAll((error) =>
    HttpServerResponse.json({ error: String(error) }, { status: 400 })
  )
)

export const pieceRoutes = HttpRouter.empty.pipe(
  HttpRouter.post("/import", importPiece),
  HttpRouter.get("/list", listPieces)
)
