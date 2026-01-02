# Note Coloring UX Spec

## Goal
Match Piano Marvel's note coloring UX: notes on the staff change color in real-time as they're played.

## Color States

| State | Color | Trigger |
|-------|-------|---------|
| Pending | Black | Default state, note not yet played |
| Correct | Green (#16a34a) | Right pitch, within 150ms tolerance |
| Wrong | Red (#dc2626) | Wrong pitch, OR correct pitch but >150ms late |
| Missed | Gray (#9ca3af) | Playhead passed note + 150ms grace period without being played |
| Extra | Red indicator | Note played that's not in the score |

**Simplification**: No yellow/orange "late" state. Binary correct/wrong only.

## Visual Design

### Note Coloring
- **Scope**: Note head only (the oval part), not stems or flags
- **Application**: Modify SVG fill and stroke on Verovio note elements
- **Persistence**: Colors persist until session reset (retry or new session start)

### Extra Note Indicators
- **Position**: At current playhead X position, at the pitch's Y position on staff
- **Appearance**: Red note head indicator (same as wrong notes but rendered as overlay)
- **Persistence**: Stays visible until session reset

## Timing Rules

### Correct Note Detection
- Timing tolerance: **150ms** after expected note time
- Notes played within this window = green
- Notes played after this window = red (too late)

### Missed Note Detection
- Grace period: **150ms** after playhead passes expected note position
- If note not played within grace period → mark as gray (missed)

### Playhead Behavior
- Auto-starts on first correct note played (existing behavior)
- Determines the "current time" for missed note detection

## Chord Handling
- Each note in a chord is colored individually
- Playing 2 of 3 notes in a chord: 2 green, 1 missed (gray)
- No all-or-nothing chord evaluation

## State Lifecycle

```
Session Start
    ↓
All notes → Pending (black)
    ↓
User plays notes → Correct/Wrong/Extra
Playhead advances → Missed for unplayed notes
    ↓
Session End / Retry
    ↓
All notes → Pending (black)
```

## Technical Implementation

### Data Flow
1. Verovio renders score, provides note elements with `{elementId, pitch, onset}`
2. `useNoteColoring.initializeNoteMap()` creates pitch+time → elementId mapping
3. Server sends `NoteSubmitResult` with `{pitch, result, expectedNoteTime}`
4. `processNoteResult()` finds matching element and applies color
5. `markMissedNotes(currentTime)` colors unplayed notes as missed

### Key Matching
- Current: composite key `${pitch}-${roundedOnset}` (rounded to 10ms)
- Issue: Server `expectedNoteTime` may not match Verovio `onset`
- Solution: Use fuzzy matching with ±200ms tolerance, or have server return elementId

### SVG Coloring
Target the note head specifically within Verovio's SVG structure:
- Find element by ID
- Query child elements that represent the note head
- Set `fill` and `stroke` style properties

## Open Questions (Resolved)

1. ~~Does server return Verovio element ID?~~ → Need to investigate, use fuzzy matching as fallback
2. ~~Time units server vs Verovio?~~ → Need to verify, likely both in ms
3. ~~Color note heads only or entire notes?~~ → **Note heads only**

## Implementation Checklist

- [ ] Fix note matching between server times and Verovio times
- [ ] Apply colors to note heads only (not stems/flags)
- [ ] Implement extra note indicators at playhead position
- [ ] Remove yellow/late state, simplify to green/red only
- [ ] Add 150ms grace period for missed note detection
- [ ] Ensure colors reset on session start and retry
