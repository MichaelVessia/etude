import { SqliteClient } from "@effect/sql-sqlite-bun"
import { SqlClient } from "@effect/sql"
import { Effect, Layer } from "effect"

// In-memory SQLite for tests
export const SqliteTestLayer = SqliteClient.layer({ filename: ":memory:" })

// Setup/teardown helpers
export const setupTables = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`
    CREATE TABLE IF NOT EXISTS pieces (
      id text PRIMARY KEY NOT NULL,
      name text NOT NULL,
      composer text,
      file_path text NOT NULL,
      total_measures integer NOT NULL,
      difficulty text,
      notes_json text NOT NULL,
      added_at text NOT NULL
    )
  `
  yield* sql`
    CREATE TABLE IF NOT EXISTS attempts (
      id text PRIMARY KEY NOT NULL,
      piece_id text NOT NULL,
      timestamp text NOT NULL,
      measure_start integer NOT NULL,
      measure_end integer NOT NULL,
      hand text NOT NULL,
      tempo integer NOT NULL,
      note_accuracy real NOT NULL,
      timing_accuracy real NOT NULL,
      combined_score real NOT NULL,
      FOREIGN KEY (piece_id) REFERENCES pieces(id)
    )
  `
})

export const clearTables = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`DELETE FROM attempts`
  yield* sql`DELETE FROM pieces`
})

// Compose test layer with repo
export const makeTestLayer = <A, E, R>(repoLayer: Layer.Layer<A, E, R>) =>
  repoLayer.pipe(Layer.provideMerge(SqliteTestLayer))
