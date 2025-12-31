import { SqlClient, SqlError } from "@effect/sql"
import { Effect, Layer } from "effect"
import {
  Attempt,
  AttemptId,
  PieceId,
  MeasureNumber,
  Hand,
  TempoPercent,
  Accuracy,
} from "@etude/shared"

export interface AttemptCreate {
  pieceId: PieceId
  measureStart: number
  measureEnd: number
  hand: Hand
  tempo: number
  noteAccuracy: number
  timingAccuracy: number
  combinedScore: number
}

export class AttemptRepo extends Effect.Tag("AttemptRepo")<
  AttemptRepo,
  {
    readonly listByPiece: (pieceId: PieceId) => Effect.Effect<Attempt[], SqlError.SqlError>
    readonly create: (attempt: AttemptCreate) => Effect.Effect<Attempt, SqlError.SqlError>
    readonly getById: (id: AttemptId) => Effect.Effect<Attempt | null, SqlError.SqlError>
    readonly deleteByPiece: (pieceId: PieceId) => Effect.Effect<void, SqlError.SqlError>
  }
>() {}

interface AttemptRow {
  id: string
  piece_id: string
  timestamp: string
  measure_start: number
  measure_end: number
  hand: string
  tempo: number
  note_accuracy: number
  timing_accuracy: number
  combined_score: number
}

const rowToDomain = (row: AttemptRow): Attempt =>
  new Attempt({
    id: row.id as AttemptId,
    pieceId: row.piece_id as PieceId,
    timestamp: new Date(row.timestamp),
    measureStart: row.measure_start as MeasureNumber,
    measureEnd: row.measure_end as MeasureNumber,
    hand: row.hand as Hand,
    tempo: row.tempo as TempoPercent,
    noteAccuracy: row.note_accuracy as Accuracy,
    timingAccuracy: row.timing_accuracy as Accuracy,
    combinedScore: row.combined_score,
  })

export const AttemptRepoLive = Layer.effect(
  AttemptRepo,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    return {
      listByPiece: (pieceId: PieceId) =>
        Effect.gen(function* () {
          const rows =
            yield* sql<AttemptRow>`SELECT * FROM attempts WHERE piece_id = ${pieceId} ORDER BY timestamp DESC`
          return rows.map(rowToDomain)
        }),

      create: (attempt: AttemptCreate) =>
        Effect.gen(function* () {
          const id = crypto.randomUUID() as AttemptId
          const now = new Date().toISOString()

          yield* sql`
            INSERT INTO attempts (id, piece_id, timestamp, measure_start, measure_end, hand, tempo, note_accuracy, timing_accuracy, combined_score)
            VALUES (${id}, ${attempt.pieceId}, ${now}, ${attempt.measureStart}, ${attempt.measureEnd}, ${attempt.hand}, ${attempt.tempo}, ${attempt.noteAccuracy}, ${attempt.timingAccuracy}, ${attempt.combinedScore})
          `

          return new Attempt({
            id,
            pieceId: attempt.pieceId,
            timestamp: new Date(now),
            measureStart: attempt.measureStart as MeasureNumber,
            measureEnd: attempt.measureEnd as MeasureNumber,
            hand: attempt.hand,
            tempo: attempt.tempo as TempoPercent,
            noteAccuracy: attempt.noteAccuracy as Accuracy,
            timingAccuracy: attempt.timingAccuracy as Accuracy,
            combinedScore: attempt.combinedScore,
          })
        }),

      getById: (id: AttemptId) =>
        Effect.gen(function* () {
          const rows =
            yield* sql<AttemptRow>`SELECT * FROM attempts WHERE id = ${id}`
          if (rows.length === 0) {
            return null
          }
          return rowToDomain(rows[0]!)
        }),

      deleteByPiece: (pieceId: PieceId) =>
        Effect.gen(function* () {
          yield* sql`DELETE FROM attempts WHERE piece_id = ${pieceId}`
        }),
    }
  })
)
