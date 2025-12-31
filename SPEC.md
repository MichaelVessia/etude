# Etude - Piano Practice Tool

A personal piano practice application for assessing performance against sheet music. Connect a MIDI keyboard, load a piece, play through it, and get scored on accuracy.

## Overview

**Problem:** Piano Marvel and similar tools are subscription-based, cloud-dependent, and over-featured for simple practice assessment.

**Solution:** A self-hosted, local-first practice tool that:
- Renders sheet music from MusicXML
- Captures MIDI input from a connected keyboard (Kawai CA49)
- Scores performance on note and timing accuracy
- Tracks progress over time

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Browser (localhost)                  │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │        Sheet Music (Verovio SVG)                │   │
│  │        - Highlights current position            │   │
│  │        - Colors notes: correct/wrong/missed     │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │        Controls                                  │   │
│  │        [Play ▶] [Tempo: 100%] [Hand: Both ▼]   │   │
│  │        [Measures: 1-end]                        │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │        Score Display                            │   │
│  │        Note: 94%  |  Timing: 87%  |  Total: 91 │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  Web MIDI API ←→ Keyboard                              │
│  Tone.js ←→ Audio Output                               │
└─────────────────────────────────────────────────────────┘
                          ▲
                          │ WebSocket (state sync)
                          ▼
┌─────────────────────────────────────────────────────────┐
│                 Bun + Effect Server                     │
│                                                         │
│  Services:                                              │
│  ├─ MusicXmlService    - parse MusicXML, extract notes │
│  ├─ ComparisonService  - match played vs expected      │
│  ├─ SessionService     - track current practice state  │
│  ├─ ScoreService       - calculate and persist scores  │
│  └─ ConfigService      - timing tolerance, weights     │
│                                                         │
│  Storage: SQLite (bun:sqlite via @effect/sql)          │
└─────────────────────────────────────────────────────────┘
```

## Tech Stack

### Server
| Component | Technology |
|-----------|------------|
| Runtime | Bun |
| Framework | Effect |
| HTTP/WebSocket | @effect/platform |
| RPC | @effect/rpc (WebSocket transport, streaming) |
| Database | @effect/sql-sqlite-bun (queries) + drizzle-kit (migrations) |
| Schema/Validation | @effect/schema |
| Config | @effect/platform FileSystem |
| Logging | Effect Logger (built-in) |

### Client
| Component | Technology |
|-----------|------------|
| UI Framework | React |
| State Management | effect-atom |
| RPC Client | @effect/rpc (WebSocket) |
| MIDI Input | Web MIDI API |
| Sheet Music Rendering | Verovio (WASM, bundled) |
| Audio Playback | Tone.js (wrapped in Effect) |
| Styling | CSS Modules |
| Build Tool | Vite |

### Shared
| Component | Technology |
|-----------|------------|
| Package Structure | Bun workspaces (server, client, shared) |
| Testing | @codeforbreakfast/bun-test-effect |

## Core Features (MVP)

### 1. Piece Loading
- Load MusicXML files from local library
- Parse and extract:
  - Note events (pitch, duration, timing)
  - Staff/hand assignment (treble = right, bass = left)
  - Measure boundaries
  - Tempo markings

### 2. Sheet Music Display
- Render MusicXML via Verovio to SVG
- **Auto-scroll**: Single continuous render, viewport scrolls to follow current position
- Highlight current playback/practice position (including rests)
- Color notes based on performance:
  - Default: black
  - Correct: green
  - Wrong: red
  - Missed: orange/gray (shown at session end only)

**Render Failure Handling:**
- On Verovio WASM load error or malformed file: retry once
- If still fails, show error message in place of sheet music

### 3. Audio Playback
- Play the piece so user knows how it should sound
- Adjustable tempo (50%, 75%, 100%, etc.)
- Play selected hand only (left, right, both)
- Playback cursor follows along in the score
- **Playback end**: Stops at end of selected measures (no auto-loop)
- **Mutually exclusive with assessment**: Must stop playback before starting assessment

### 4. MIDI Input
- Connect to Kawai CA49 via Web MIDI API
- Capture note-on/note-off events with timestamps
- Handle velocity (for future use, not scored in MVP)

### 5. Assessment Mode
- User selects piece and practice parameters:
  - Measure range (e.g., 1-16, or 12-24) via text input fields
  - Which hand(s) to assess
  - Tempo percentage (timing tolerance is fixed, not scaled)
- **Start sequence**: Visual countdown (3-2-1-Go!) then timer begins
- User plays through the section
- System compares played notes to expected notes
- **Real-time feedback**: Notes turn green (correct) or red (wrong) immediately when played
- **Missed notes**: Only shown at session end (not during play) to avoid distraction
- **Single-hand mode**: Notes from the non-selected hand are completely ignored
- **No timeout**: Assessment runs until user explicitly ends it or reaches end of section
- Final score displayed at end

**MIDI Disconnect Handling:**
- If keyboard disconnects mid-session, show "Keyboard disconnected" prompt
- User can reconnect and continue, or end session early

### 6. Scoring

**Note Matching:**
- **Greedy matching**: Played notes match the nearest expected note (by time) that hasn't been matched yet
- Allows recovery from timing mistakes without double-penalty
- **Order-sensitive for repeated pitches**: If C4-C4-C4 expected, first played C4 matches first expected

**Note Accuracy:**
- Correct note: played the right pitch at approximately the right time
- Wrong note: played a pitch not expected at that time
- Missed note: expected note was never played
- **Extra notes**: Tracked separately, do NOT affect accuracy score (displayed as "Extra notes: N")

```
note_accuracy = correct_notes / total_expected_notes
```

**Chord Scoring:**
- Chords scored as a unit (all-or-nothing)
- All notes must be correct for chord to count as correct
- Partial chords count as wrong

**Timing Accuracy:**
- For each correct note, measure how close to expected timing
- **Timing tolerance window**: 150ms (fixed, does not scale with tempo)
- **Grace period**: 75ms—notes within this are "perfect" timing
- **Release timing ignored**: Only note-on is scored, not note-off/duration
- Notes within tolerance: full timing credit
- Notes outside tolerance but correct pitch: partial credit based on distance

```
timing_accuracy = sum(timing_scores) / total_expected_notes
```

**Combined Score:**
```
total_score = (note_weight * note_accuracy) + (timing_weight * timing_accuracy)
```

Default weights: 60% note accuracy, 40% timing accuracy (configurable).

Display shows all three: Note %, Timing %, Combined score (percentages, no letter grades).

**Per-Hand Breakdown:**
- When practicing "both hands", show combined score + separate left/right accuracy
- Helps identify which hand needs more work

### 7. Progress Tracking
- Log every practice attempt:
  - Timestamp
  - Piece ID
  - Measure range
  - Hand(s) practiced
  - Tempo
  - Note accuracy
  - Timing accuracy
  - Combined score
- View history per piece
- Track improvement over time

### 8. Piece Library
- Bundle 3-5 starter pieces (public domain, varied difficulty)
- User can add their own MusicXML files
- Simple file-based organization: `pieces/` directory
- **Auto-scan**: App scans `pieces/` folder on startup, auto-adds new files
- Metadata stored in SQLite (piece name, difficulty tag, etc.)

**MusicXML Parsing:**
- **Best effort + warning**: Load what's parseable, show warning about skipped elements
- **Multi-part files**: Only extract piano parts, ignore other instruments
- **Ornaments (trills, grace notes)**: Ignored for scoring (only "main" notes scored)
- **Tied notes**: Treated as single note event (user plays once)
- **Pickup measures**: Measure 0 is pickup, measure 1 is first full measure
- **No transposition**: Play exactly as written
- **Default tempo**: 120 BPM if no tempo marking in file

## Data Models

### Branded Types (shared/domain.ts)
```typescript
import { Schema } from "effect"

// IDs
export const PieceId = Schema.String.pipe(Schema.brand("PieceId"))
export type PieceId = typeof PieceId.Type

export const AttemptId = Schema.String.pipe(Schema.brand("AttemptId"))
export type AttemptId = typeof AttemptId.Type

// Music primitives
export const MidiPitch = Schema.Number.pipe(Schema.brand("MidiPitch"))  // 0-127
export type MidiPitch = typeof MidiPitch.Type

export const MeasureNumber = Schema.Number.pipe(Schema.brand("MeasureNumber"))
export type MeasureNumber = typeof MeasureNumber.Type

export const Milliseconds = Schema.Number.pipe(Schema.brand("Milliseconds"))
export type Milliseconds = typeof Milliseconds.Type

export const Velocity = Schema.Number.pipe(Schema.brand("Velocity"))  // 0-127
export type Velocity = typeof Velocity.Type

export const TempoPercent = Schema.Number.pipe(Schema.brand("TempoPercent"))  // e.g., 100 = original
export type TempoPercent = typeof TempoPercent.Type

export const Accuracy = Schema.Number.pipe(Schema.brand("Accuracy"))  // 0-1
export type Accuracy = typeof Accuracy.Type

export const Hand = Schema.Literal("left", "right", "both")
export type Hand = typeof Hand.Type

export const Difficulty = Schema.Literal("beginner", "intermediate", "advanced")
export type Difficulty = typeof Difficulty.Type
```

### Piece (Schema.Class)
```typescript
export class Piece extends Schema.Class<Piece>("Piece")({
  id: PieceId,
  name: Schema.String,
  composer: Schema.OptionFromNullOr(Schema.String),
  filePath: Schema.String,
  totalMeasures: MeasureNumber,
  difficulty: Schema.OptionFromNullOr(Difficulty),
  addedAt: Schema.Date,
}) {}

// Usage: Piece.make({ id: PieceId.make("..."), ... })
```

### NoteEvent (Schema.Class)
```typescript
export class NoteEvent extends Schema.Class<NoteEvent>("NoteEvent")({
  pitch: MidiPitch,
  startTime: Milliseconds,    // from piece start
  duration: Milliseconds,
  measure: MeasureNumber,
  hand: Hand,
  voice: Schema.OptionFromNullOr(Schema.Number),
}) {}
```

### PlayedNote (Schema.Class)
```typescript
export class PlayedNote extends Schema.Class<PlayedNote>("PlayedNote")({
  pitch: MidiPitch,
  timestamp: Milliseconds,    // from assessment start
  velocity: Velocity,
  duration: Schema.OptionFromNullOr(Milliseconds),  // filled on note-off
}) {}
```

### Attempt (Schema.Class)
```typescript
export class Attempt extends Schema.Class<Attempt>("Attempt")({
  id: AttemptId,
  pieceId: PieceId,
  timestamp: Schema.Date,
  measureStart: MeasureNumber,
  measureEnd: MeasureNumber,
  hand: Hand,
  tempo: TempoPercent,
  noteAccuracy: Accuracy,
  timingAccuracy: Accuracy,
  combinedScore: Schema.Number,  // 0-100
}) {}
```

### Errors (Schema.TaggedError)
```typescript
export class ParseError extends Schema.TaggedError<ParseError>()(
  "ParseError",
  {
    reason: Schema.Literal("MalformedXml", "UnsupportedFeature", "NoPianoPart", "EmptyPiece"),
    details: Schema.String,
    filePath: Schema.String,
  }
) {}

export class SessionError extends Schema.TaggedError<SessionError>()(
  "SessionError",
  {
    reason: Schema.Literal("NotStarted", "AlreadyActive", "InvalidState"),
  }
) {}

export class PieceNotFound extends Schema.TaggedError<PieceNotFound>()(
  "PieceNotFound",
  { id: PieceId }
) {}
```

### Config
```yaml
scoring:
  timing_tolerance_ms: 150
  timing_grace_ms: 75      # below this = perfect timing
  note_weight: 0.6
  timing_weight: 0.4

audio:
  soundfont: "acoustic_grand_piano"

midi:
  device: "auto"           # or specific device name

server:
  port: 5173
```

**Config editing**: Text file only (no settings UI)

## Project Structure

Bun workspaces monorepo:

```
etude/
├── packages/
│   ├── server/
│   │   ├── src/
│   │   │   ├── main.ts                 # Entry point, layer composition
│   │   │   ├── sql.ts                  # SqliteClient layer config
│   │   │   ├── repos/
│   │   │   │   ├── piece-repo.ts       # PieceRepo Effect.Tag + Live layer
│   │   │   │   └── attempt-repo.ts     # AttemptRepo Effect.Tag + Live layer
│   │   │   ├── services/
│   │   │   │   ├── MusicXml.ts         # Parse MusicXML → NoteEvent[]
│   │   │   │   ├── Comparison.ts       # Compare played vs expected
│   │   │   │   ├── Session.ts          # Current practice state
│   │   │   │   └── Config.ts           # Load/provide configuration
│   │   │   ├── rpc/
│   │   │   │   ├── piece-handlers.ts   # PieceRpcs.toLayer() handlers
│   │   │   │   └── session-handlers.ts # SessionRpcs.toLayer() handlers
│   │   │   ├── db/
│   │   │   │   ├── schema.ts           # Drizzle schema (for migrations)
│   │   │   │   └── migrations/
│   │   │   └── errors/
│   │   │       ├── ParseError.ts
│   │   │       └── SessionError.ts
│   │   ├── tests/
│   │   │   ├── helpers/
│   │   │   │   └── test-db.ts          # In-memory SQLite, setup/clear helpers
│   │   │   ├── piece-repo.test.ts
│   │   │   ├── attempt-repo.test.ts
│   │   │   └── comparison.test.ts
│   │   ├── drizzle.config.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── client/
│   │   ├── src/
│   │   │   ├── main.tsx                # React entry point
│   │   │   ├── App.tsx
│   │   │   ├── atoms/
│   │   │   │   ├── piece.ts            # Current piece atom
│   │   │   │   ├── session.ts          # Session state atom
│   │   │   │   └── notes.ts            # Note results atom
│   │   │   ├── hooks/
│   │   │   │   ├── useMidi.ts          # Web MIDI wrapper
│   │   │   │   ├── useVerovio.ts       # Verovio setup
│   │   │   │   └── useAudio.ts         # Tone.js playback
│   │   │   ├── components/
│   │   │   │   ├── SheetMusic/
│   │   │   │   ├── Controls/
│   │   │   │   ├── Results/
│   │   │   │   └── PieceLibrary/
│   │   │   ├── rpc/
│   │   │   │   └── client.ts           # @effect/rpc client setup
│   │   │   └── styles/
│   │   │       └── *.module.css
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── shared/
│       ├── src/
│       │   ├── domain.ts               # Branded types (PieceId, MidiPitch, etc.)
│       │   ├── rpc/
│       │   │   ├── PieceRpcs.ts        # RpcGroup.make() definitions
│       │   │   └── SessionRpcs.ts
│       │   └── schema/
│       │       ├── Piece.ts            # @effect/schema
│       │       ├── NoteEvent.ts
│       │       ├── Attempt.ts
│       │       └── Session.ts
│       ├── package.json
│       └── tsconfig.json
│
├── pieces/                             # MusicXML library
│   ├── bach-prelude-c.xml
│   └── ...
├── config.yaml                         # User configuration
├── bunfig.toml                         # Bun config (test root)
├── package.json                        # Root: workspaces, scripts
└── README.md
```

## RPC Protocol

Uses @effect/rpc with WebSocket transport and bidirectional streaming.

### RPC Definitions

```typescript
// REST-style RPCs (HTTP)
class PieceRpcs extends RpcGroup.make(
  Rpc.make("listPieces", { success: Schema.Array(Piece) }),
  Rpc.make("getPiece", { payload: { id: PieceId }, success: Piece, error: PieceNotFound }),
  Rpc.make("getAttempts", { payload: { pieceId: PieceId }, success: Schema.Array(Attempt) }),
) {}

// Session RPCs (WebSocket, bidirectional streaming)
class SessionRpcs extends RpcGroup.make(
  // Start session, receive feedback stream
  Rpc.make("startSession", {
    payload: { pieceId: PieceId, measureStart: number, measureEnd: number, hand: Hand, tempo: number },
    success: SessionStarted,
    error: SessionError,
  }),

  // Stream MIDI notes in, receive feedback out (bidirectional)
  Rpc.make("midiStream", {
    payload: { pitch: number, velocity: number, timestamp: number, on: boolean },
    success: NoteResult,
    stream: true,  // Server streams results back
  }),

  // End session, get final score
  Rpc.make("endSession", {
    success: SessionComplete,
  }),
) {}
```

### Message Types

```typescript
// Session started acknowledgment
interface SessionStarted {
  sessionId: string;
  expectedNoteCount: number;
  measureRange: [number, number];
}

// Real-time feedback for each played note
interface NoteResult {
  pitch: number;
  result: "correct" | "wrong" | "extra";
  timingOffset: number;  // ms from expected (negative = early)
}

// Final session results
interface SessionComplete {
  attemptId: string;
  noteAccuracy: number;      // 0-1
  timingAccuracy: number;    // 0-1
  combinedScore: number;     // 0-100
  leftHandAccuracy?: number; // if both hands
  rightHandAccuracy?: number;
  extraNotes: number;
  missedNotes: NoteEvent[];  // for end-of-session highlighting
}
```

## User Flow

1. **Open app** → See piece library
2. **Select piece** → Sheet music renders, playback controls appear
3. **Listen** (optional) → Click play to hear the piece at desired tempo
4. **Configure practice** → Select measures, hand, tempo
5. **Start assessment** → Click "Start", brief countdown
6. **Play** → User plays, notes light up green/red in real-time
7. **Finish** → Score displays (note %, timing %, combined)
8. **Review** → See which notes were missed/wrong (highlighted in score)
9. **Retry or pick new section**

## Future Features (Post-MVP)

- **Learn mode**: Waits for correct note before advancing
- **Metronome**: Built-in click track
- **Section looping**: Auto-repeat a section N times
- **Sight-reading mode**: Random piece, no preview
- **Statistics dashboard**: Charts of progress over time
- **MIDI output**: Play accompaniment, click track via MIDI
- **Mobile support**: Responsive UI for tablets
- **Import from MuseScore**: Direct .mscz support
- **Recording**: Save performances as MIDI/audio

## UI/UX Details

### Keyboard Shortcuts
- `Space` — Start/stop playback or assessment
- `Escape` — End current session
- Arrow keys — Navigate between measures (when not in session)

### History View
- Shows last 10 attempts per piece by default
- Displays: date, measure range, hand, tempo, note %, timing %, combined %

### Accessibility
- Semantic HTML
- Visible focus states
- Color contrast compliance
- Standard keyboard navigation

### Session State Persistence
- **No persistence**: App always starts fresh at library view
- Does not remember last piece or settings between sessions

## Technical Architecture

### Effect Service Design

**Layer composition**: Granular layers with Live + Test variants per service.

```typescript
// Each service has its own layer
const MusicXmlServiceLive = Layer.effect(MusicXmlService, ...)
const MusicXmlServiceTest = Layer.succeed(MusicXmlService, mockImpl)

// Composed for runtime
const AppLayer = Layer.mergeAll(
  MusicXmlServiceLive,
  SessionServiceLive,
  DbServiceLive,
  ...
)
```

**Error types**: Per-service `Schema.TaggedError` (see Data Models section).
- Fully serializable (can send over RPC)
- Pattern match with `Match.tag()`
- Create with `.make()` or constructor

### State Management

**Server-side session state**: Mutable `Ref<MatchState>` in fiber scope.
- State lives in the session fiber, dies when fiber ends
- Per-session connection lifecycle (connect on start, disconnect on end)
- On stream error: fail session, user retries manually

```typescript
interface MatchState {
  expectedNotes: NoteEvent[];
  matchedNotes: Map<number, MatchResult>;  // index → result
  playedNotes: PlayedNote[];
  sessionStart: number;  // timestamp
}
```

**Client-side state**: effect-atom with React.
- Atoms for: currentPiece, sessionState, noteResults, scores
- Derived atoms for UI computations
- Integrates with @effect/rpc client

### Data Flow

**MIDI → Feedback loop**:
1. Web MIDI API captures note-on with high-res timestamp
2. Client sends via RPC stream: `{ pitch, velocity, timestamp, on: true }`
3. Server's ComparisonService matches against expected notes (greedy)
4. Server streams back: `{ pitch, result, timingOffset }`
5. Client updates effect-atom state, React re-renders note color

**Note timing**: Client timestamps (Web MIDI DOMHighResTimeStamp).
- More accurate than server-assigned timestamps
- Localhost means no clock sync issues

### Database

**SQLite Layer** (server/sql.ts):
```typescript
import { SqliteClient } from "@effect/sql-sqlite-bun"
import { Config } from "effect"

const SqliteConfig = Config.string("DATABASE_PATH").pipe(
  Config.withDefault("./data/etude.db")
)

export const SqlLive = SqliteClient.layerConfig(
  Config.map(SqliteConfig, (filename) => ({ filename }))
)
```

**Schema** (Drizzle, for migrations only):
```typescript
export const pieces = sqliteTable("pieces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  composer: text("composer"),
  filePath: text("file_path").notNull(),
  totalMeasures: integer("total_measures").notNull(),
  difficulty: text("difficulty"),
  notesJson: text("notes_json").notNull(),  // JSON blob of NoteEvent[]
  addedAt: text("added_at").notNull(),      // ISO8601 string
});

export const attempts = sqliteTable("attempts", {
  id: text("id").primaryKey(),
  pieceId: text("piece_id").references(() => pieces.id),
  timestamp: text("timestamp").notNull(),   // ISO8601 string
  measureStart: integer("measure_start").notNull(),
  measureEnd: integer("measure_end").notNull(),
  hand: text("hand").notNull(),
  tempo: integer("tempo").notNull(),
  noteAccuracy: real("note_accuracy").notNull(),
  timingAccuracy: real("timing_accuracy").notNull(),
  combinedScore: real("combined_score").notNull(),
});
```

**Repository Pattern** (like subq):
```typescript
// Effect.Tag for dependency injection
export class PieceRepo extends Effect.Tag("PieceRepo")<
  PieceRepo,
  {
    readonly list: () => Effect.Effect<Piece[]>
    readonly getById: (id: PieceId) => Effect.Effect<Piece, PieceNotFound>
    readonly create: (piece: PieceCreate) => Effect.Effect<Piece>
    readonly delete: (id: PieceId) => Effect.Effect<void>
  }
>() {}

// Live implementation using @effect/sql
export const PieceRepoLive = Layer.effect(
  PieceRepo,
  Effect.gen(function* () {
    const sql = yield* SqlClient
    return {
      list: () => Effect.gen(function* () {
        const rows = yield* sql`SELECT * FROM pieces ORDER BY name`
        return rows.map(rowToDomain)
      }),
      // ...
    }
  })
)
```

**Storage strategy**:
- Queries via @effect/sql template literals
- Drizzle schema for migrations only (drizzle-kit generate/migrate)
- Parsed NoteEvent[] stored as JSON blob
- Dates stored as ISO8601 text strings
- Auto-create DB on first run

### Piece Library Management

- **Auto-scan** `pieces/` directory on server startup
- **Orphan removal**: If file missing during scan, delete DB record
- **Best-effort parsing**: Parse what's parseable, log warnings for unsupported features
- **Piano parts only**: Multi-instrument files extract only piano

### MusicXML Parsing

Wrap existing library (e.g., musicxml-interfaces) with Effect error handling:

```typescript
const parseMusicXml = (path: string): Effect.Effect<NoteEvent[], ParseError> => ...
```

### Testing (@codeforbreakfast/bun-test-effect)

**Test helpers** (server/tests/helpers/test-db.ts):
```typescript
import { SqliteClient } from "@effect/sql-sqlite-bun"

// In-memory SQLite for tests
export const SqliteTestLayer = SqliteClient.layer({ filename: ":memory:" })

// Setup/teardown helpers
export const setupTables = Effect.gen(function* () {
  const sql = yield* SqlClient
  yield* sql`CREATE TABLE pieces (...)`
  yield* sql`CREATE TABLE attempts (...)`
})

export const clearTables = Effect.gen(function* () {
  const sql = yield* SqlClient
  yield* sql`DELETE FROM attempts`
  yield* sql`DELETE FROM pieces`
})

// Compose test layer with repo
export const makeTestLayer = <Out, Err>(repoLayer: Layer.Layer<Out, Err, SqlClient>) =>
  repoLayer.pipe(Layer.provideMerge(SqliteTestLayer))
```

**Test example** (server/tests/piece-repo.test.ts):
```typescript
import { describe, expect, it } from "@codeforbreakfast/bun-test-effect"

const TestLayer = makeTestLayer(PieceRepoLive)

describe("PieceRepo", () => {
  describe("create", () => {
    it.effect("creates a piece with all fields", () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables

        const repo = yield* PieceRepo
        const created = yield* repo.create({
          name: "Test Piece",
          filePath: "/pieces/test.xml",
          totalMeasures: MeasureNumber.make(32),
          notesJson: "[]",
        })

        expect(created.name).toBe("Test Piece")
        expect(created.totalMeasures).toBe(32)
      }).pipe(Effect.provide(TestLayer))
    )
  })

  describe("getById", () => {
    it.effect("returns PieceNotFound for missing piece", () =>
      Effect.gen(function* () {
        yield* setupTables
        yield* clearTables

        const repo = yield* PieceRepo
        const result = yield* repo.getById(PieceId.make("nonexistent")).pipe(
          Effect.flip  // Get the error
        )

        expect(result._tag).toBe("PieceNotFound")
      }).pipe(Effect.provide(TestLayer))
    )
  })
})

## Technical Constraints

### Browser Support
- Chromium-based browsers only (Chrome, Edge, Brave, etc.)
- Web MIDI API required (not available in Firefox/Safari)

### Database
- SQLite via @effect/sql-sqlite-bun (queries) + drizzle-kit (migrations)
- **Auto-created** on first run if missing (no setup command needed)

## Open Technical Questions

1. **Verovio measure mapping**: How to reliably map Verovio SVG element IDs back to measure numbers for highlighting?
2. **Hand detection in MusicXML**: Confirm staff 1 = treble = right, staff 2 = bass = left is standard

## MVP Milestones

1. **M1: Project setup**
   - Initialize Bun project with Effect
   - Set up client build pipeline
   - Basic HTML shell

2. **M2: MIDI proof of concept**
   - Web MIDI API integration
   - Display incoming notes in console/UI
   - Verify CA49 works

3. **M3: Sheet music rendering**
   - Load MusicXML file
   - Render via Verovio
   - Display in browser

4. **M4: Audio playback**
   - Extract MIDI from Verovio
   - Play via Tone.js/soundfont
   - Tempo control

5. **M5: Note extraction**
   - Parse expected notes from MusicXML
   - Map to timeline
   - Identify hand assignment

6. **M6: Comparison engine**
   - Match played notes to expected
   - Calculate accuracy scores
   - Real-time feedback

7. **M7: Session flow**
   - Start/end assessment
   - WebSocket state sync
   - Score display

8. **M8: Persistence**
   - SQLite setup
   - Save attempts
   - View history

9. **M9: Polish**
   - Piece library UI
   - Section selection
   - Bundle starter pieces
