import { SqliteClient } from "@effect/sql-sqlite-bun"
import { Config } from "effect"

const SqliteConfig = Config.string("DATABASE_PATH").pipe(
  Config.withDefault("./data/etude.db")
)

export const SqlLive = SqliteClient.layerConfig(
  Config.map(SqliteConfig, (filename) => ({ filename }))
)

export const SqlTest = SqliteClient.layer({ filename: ":memory:" })
