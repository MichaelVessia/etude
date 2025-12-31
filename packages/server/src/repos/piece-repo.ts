import { SqlClient, SqlError } from "@effect/sql"
import { Effect, Layer, Option } from "effect"
import {
  Piece,
  PieceId,
  MeasureNumber,
  NoteEvent,
  Difficulty,
} from "@etude/shared"
import { PieceNotFound } from "@etude/shared"

export interface PieceCreate {
  name: string
  composer: string | null
  filePath: string
  totalMeasures: number
  difficulty: Difficulty | null
  notesJson: string
}

export class PieceRepo extends Effect.Tag("PieceRepo")<
  PieceRepo,
  {
    readonly list: () => Effect.Effect<Piece[], SqlError.SqlError>
    readonly getById: (id: PieceId) => Effect.Effect<Piece, PieceNotFound | SqlError.SqlError>
    readonly getNotes: (id: PieceId) => Effect.Effect<NoteEvent[], PieceNotFound | SqlError.SqlError>
    readonly create: (piece: PieceCreate) => Effect.Effect<Piece, SqlError.SqlError>
    readonly delete: (id: PieceId) => Effect.Effect<void, SqlError.SqlError>
    readonly getByFilePath: (
      filePath: string
    ) => Effect.Effect<Piece | null, SqlError.SqlError>
  }
>() {}

interface PieceRow {
  id: string
  name: string
  composer: string | null
  file_path: string
  total_measures: number
  difficulty: string | null
  notes_json: string
  added_at: string
}

const rowToDomain = (row: PieceRow): Piece =>
  new Piece({
    id: row.id as PieceId,
    name: row.name,
    composer: Option.fromNullable(row.composer),
    filePath: row.file_path,
    totalMeasures: row.total_measures as MeasureNumber,
    difficulty: Option.fromNullable(row.difficulty as Difficulty | null),
    addedAt: new Date(row.added_at),
  })

export const PieceRepoLive = Layer.effect(
  PieceRepo,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    return {
      list: () =>
        Effect.gen(function* () {
          const rows = yield* sql<PieceRow>`SELECT * FROM pieces ORDER BY name`
          return rows.map(rowToDomain)
        }),

      getById: (id: PieceId) =>
        Effect.gen(function* () {
          const rows =
            yield* sql<PieceRow>`SELECT * FROM pieces WHERE id = ${id}`
          if (rows.length === 0) {
            return yield* new PieceNotFound({ id })
          }
          return rowToDomain(rows[0]!)
        }),

      getNotes: (id: PieceId) =>
        Effect.gen(function* () {
          const rows =
            yield* sql<{ notes_json: string }>`SELECT notes_json FROM pieces WHERE id = ${id}`
          if (rows.length === 0) {
            return yield* new PieceNotFound({ id })
          }
          return JSON.parse(rows[0]!.notes_json) as NoteEvent[]
        }),

      create: (piece: PieceCreate) =>
        Effect.gen(function* () {
          const id = crypto.randomUUID() as PieceId
          const now = new Date().toISOString()

          yield* sql`
            INSERT INTO pieces (id, name, composer, file_path, total_measures, difficulty, notes_json, added_at)
            VALUES (${id}, ${piece.name}, ${piece.composer}, ${piece.filePath}, ${piece.totalMeasures}, ${piece.difficulty}, ${piece.notesJson}, ${now})
          `

          return new Piece({
            id,
            name: piece.name,
            composer: Option.fromNullable(piece.composer),
            filePath: piece.filePath,
            totalMeasures: piece.totalMeasures as MeasureNumber,
            difficulty: Option.fromNullable(piece.difficulty),
            addedAt: new Date(now),
          })
        }),

      delete: (id: PieceId) =>
        Effect.gen(function* () {
          yield* sql`DELETE FROM pieces WHERE id = ${id}`
        }),

      getByFilePath: (filePath: string) =>
        Effect.gen(function* () {
          const rows =
            yield* sql<PieceRow>`SELECT * FROM pieces WHERE file_path = ${filePath}`
          if (rows.length === 0) {
            return null
          }
          return rowToDomain(rows[0]!)
        }),
    }
  })
)
