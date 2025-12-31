import { SqliteClient } from "@effect/sql-sqlite-bun"
import { SqlClient } from "@effect/sql"
import { Config, Effect, Layer } from "effect"

const SqliteConfig = Config.string("DATABASE_PATH").pipe(
  Config.withDefault("./data/etude.db")
)

const SqlClientLive = SqliteClient.layerConfig(
  Config.map(SqliteConfig, (filename) => ({ filename }))
)

// Initialize tables on startup
const initTables = Effect.gen(function* () {
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
  yield* Effect.log("Database tables initialized")
})

export const SqlLive = Layer.effectDiscard(initTables).pipe(
  Layer.provideMerge(SqlClientLive)
)

export const SqlTest = SqliteClient.layer({ filename: ":memory:" })
