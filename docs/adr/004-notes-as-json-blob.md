# ADR 004: Store Notes as JSON Blob

## Status

Accepted

## Context

Each music piece in Etude contains a sequence of notes extracted from MusicXML. A typical piece has 100-2000 notes, each with properties:

- `pitch`: MIDI note number (0-127)
- `startTime`: Onset time in seconds
- `duration`: Note length in seconds
- `measure`: Measure number
- `hand`: "left" | "right"
- `noteId`: Unique identifier for UI mapping

The question: how should these notes be stored in the database?

### Alternatives Considered

**1. Relational Table (Normalized)**

Create a `notes` table with foreign key to `pieces`:

```sql
CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  piece_id TEXT REFERENCES pieces(id),
  pitch INTEGER,
  start_time REAL,
  duration REAL,
  measure INTEGER,
  hand TEXT
);
```

Problems:
- 1000+ rows per piece; bulk insert/select overhead
- Notes are never queried independently (always loaded with piece)
- No use case for "find all notes with pitch 60 across all pieces"
- JOIN overhead on every piece load
- Index maintenance for unused query patterns

**2. Separate Note Files (Filesystem)**

Store notes as separate JSON files, reference path in database.

Problems:
- Two storage systems to manage
- Cannot deploy to Cloudflare Workers (no filesystem)
- Atomic updates become complex (DB + file must stay in sync)

**3. Structured Columns (Partial Normalization)**

Store some fields as columns, others as JSON:

```sql
CREATE TABLE pieces (
  id TEXT PRIMARY KEY,
  title TEXT,
  note_count INTEGER,
  notes_json TEXT
);
```

Problems:
- Worst of both worlds: still have JSON blob, added columns don't enable useful queries

## Decision

Store the complete note array as a JSON blob in a single `TEXT` column:

```typescript
// db/schema.ts
export const pieces = sqliteTable("pieces", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  artist: text("artist"),
  notesJson: text("notes_json").notNull(), // JSON array of NoteEvent
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
})
```

Notes are serialized on write and parsed on read:

```typescript
// Write
const notesJson = JSON.stringify(notes)

// Read
const notes: NoteEvent[] = JSON.parse(piece.notesJson)
```

Effect Schema validates the parsed structure at runtime boundaries.

## Consequences

### Positive

- **Simple queries**: Single row fetch retrieves entire piece
- **Atomic updates**: Piece and its notes update in one transaction
- **No JOIN overhead**: Notes are always needed with piece; no wasted queries
- **Flexible schema evolution**: Add note properties without migrations
- **Fast bulk operations**: No 1000-row inserts; single JSON write

### Negative

- **No note-level queries**: Cannot efficiently find "all pieces containing note X"
- **Parse overhead**: JSON.parse on every read (mitigated by typically small payloads)
- **No partial updates**: Changing one note requires rewriting entire blob
- **Size limits**: Very large pieces (10K+ notes) could hit practical limits
- **No database-level validation**: Schema enforcement happens in application code

### Neutral

- SQLite's JSON functions available if future queries needed (unlikely)
- Compression could be added if storage becomes concern (not currently needed)
