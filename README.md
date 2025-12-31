# Etude

A self-hosted piano practice tool that scores your performance against sheet music. Connect a MIDI keyboard, load a piece, play through it, and get real-time feedback on accuracy.

## Why?

Most piano practice tools are subscription-based, cloud-dependent, and over-featured. Etude is a local-first alternative that does one thing well: assess your playing and track progress.

## Features

- **Sheet music rendering** from MusicXML via Verovio
- **MIDI input** via Web MIDI API
- **Real-time feedback** - notes light up green/red as you play
- **Scoring** - note accuracy, timing accuracy, combined score
- **Progress tracking** - history of attempts per piece
- **Audio playback** - hear how the piece should sound

## Requirements

- [Bun](https://bun.sh) runtime
- Chromium-based browser (Chrome, Edge, Brave) - Web MIDI requires this
- MIDI keyboard

## Quick Start

```bash
# Install dependencies
bun install

# Start the server (runs on port 3001)
cd packages/server && bun run dev

# In another terminal, start the client (runs on port 5173)
bun run dev

# Open http://localhost:5173
```

## Architecture

```mermaid
graph TB
    subgraph Browser["Browser (localhost:5173)"]
        UI[React UI]
        Verovio[Verovio WASM]
        WebMIDI[Web MIDI API]
        ToneJS[Tone.js Audio]
    end

    subgraph Server["Bun Server (localhost:3001)"]
        API[HTTP API]
        Session[Session Service]
        Comparison[Comparison Service]
        PieceRepo[Piece Repository]
        AttemptRepo[Attempt Repository]
        SQLite[(SQLite DB)]
    end

    MIDI[MIDI Keyboard] --> WebMIDI
    WebMIDI --> UI
    UI --> API
    API --> Session
    Session --> Comparison
    Session --> PieceRepo
    Session --> AttemptRepo
    PieceRepo --> SQLite
    AttemptRepo --> SQLite
    Verovio --> UI
    ToneJS --> UI
```

### Data Flow

```mermaid
sequenceDiagram
    participant K as MIDI Keyboard
    participant C as Client
    participant S as Server
    participant DB as SQLite

    C->>S: POST /api/session/start
    S->>DB: Load piece notes
    S-->>C: Session started

    loop Each note played
        K->>C: MIDI note event
        C->>S: POST /api/session/note
        S->>S: Match against expected
        S-->>C: {result: correct/wrong/extra}
        C->>C: Update UI (green/red)
    end

    C->>S: POST /api/session/end
    S->>DB: Save attempt
    S-->>C: Final scores
```

## Project Structure

```
etude/
├── packages/
│   ├── client/          # React + Vite frontend
│   │   ├── src/
│   │   │   ├── components/   # UI components
│   │   │   ├── hooks/        # useMidi, useAudio, useSession
│   │   │   └── App.tsx
│   │   └── package.json
│   │
│   ├── server/          # Bun + Effect backend
│   │   ├── src/
│   │   │   ├── api/          # HTTP routes
│   │   │   ├── services/     # Business logic
│   │   │   ├── repos/        # Database access
│   │   │   └── db/           # Schema & migrations
│   │   └── package.json
│   │
│   └── shared/          # Shared types & schemas
│       └── src/
│           └── domain.ts     # Branded types, errors
│
├── pieces/              # MusicXML library
└── package.json         # Workspace root
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Bun |
| Backend Framework | Effect |
| Database | SQLite (@effect/sql-sqlite-bun) |
| Frontend | React + Vite |
| Sheet Music | Verovio (WASM) |
| Audio | Tone.js |
| MIDI | Web MIDI API |
| Testing | bun:test + bun-test-effect |

## Development

```bash
# Run tests
bun test

# Type check
bun run typecheck

# Lint
bun run lint

# Lint with auto-fix
bun run lint:fix
```

## How It Works

### Scoring

**Note Accuracy**: Did you play the right notes?
```
note_accuracy = correct_notes / expected_notes
```

**Timing Accuracy**: Did you play them at the right time?
- 75ms grace period = perfect timing
- 150ms tolerance window = full credit
- Beyond tolerance = partial credit based on distance

**Combined Score**:
```
combined = (0.6 * note_accuracy) + (0.4 * timing_accuracy)
```

### Note Matching

Uses greedy matching - each played note matches the nearest unmatched expected note by time. This allows recovery from timing mistakes without double-penalty.

## Configuration

The server reads `DATABASE_PATH` env var (default: `./data/etude.db`).

## License

MIT
