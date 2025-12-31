import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core"

export const pieces = sqliteTable("pieces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  composer: text("composer"),
  filePath: text("file_path").notNull(),
  totalMeasures: integer("total_measures").notNull(),
  difficulty: text("difficulty"),
  notesJson: text("notes_json").notNull(), // JSON blob of NoteEvent[]
  addedAt: text("added_at").notNull(), // ISO8601 string
})

export const attempts = sqliteTable("attempts", {
  id: text("id").primaryKey(),
  pieceId: text("piece_id")
    .references(() => pieces.id)
    .notNull(),
  timestamp: text("timestamp").notNull(), // ISO8601 string
  measureStart: integer("measure_start").notNull(),
  measureEnd: integer("measure_end").notNull(),
  hand: text("hand").notNull(),
  tempo: integer("tempo").notNull(),
  noteAccuracy: real("note_accuracy").notNull(),
  timingAccuracy: real("timing_accuracy").notNull(),
  combinedScore: real("combined_score").notNull(),
})
