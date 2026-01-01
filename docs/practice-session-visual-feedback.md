# Practice Session Visual Feedback

## Problem

Current practice session UX lacks timing and correctness feedback on the sheet music itself:

1. **No timing indicator** - User has no visual reference for expected tempo/position
2. **No note-level feedback** - User can't see which notes they hit correctly on the staff
3. **"Last note" display unhelpful** - Sidebar indicator disconnected from sheet music context

## Solution Overview

Two main visual feedback mechanisms:

1. **Playhead** - Vertical bar moving across sheet music at tempo
2. **Note coloring** - Notes colored green/yellow/red based on result

---

## Playhead Specification

### Behavior

- **Start trigger**: Begins moving when user plays first correct note
- **Speed**: Moves at user's chosen tempo percentage (50% tempo = 50% speed)
- **Sync mode**: Keeps moving regardless of user position (no pause/wait)
- **End behavior**: Stops at end of piece, auto-ends session, shows results
- **Repeats**: Honors repeat signs - playhead loops back to repeat start

### Visual Design

- **Width**: Thin line (2-3px)
- **Color**: App's primary accent color (blue)
- **Opacity**: Semi-transparent (~50%)
- **Span**: Full height spanning both treble and bass staves
- **Animation**: 60fps using requestAnimationFrame

### Multi-page Handling

- **Page turns**: Automatic when playhead reaches end of page
- **Transition**: Instant page change (no animation needed)

### Practice Mode Integration

- **Measure ranges**: Playhead spans only selected measures
- **Context display**: Surrounding measures visible but dimmed
- **Single-hand mode**: Playhead still spans both staves

---

## Note Coloring Specification

### Color Scheme

| State | Color | Condition |
|-------|-------|-----------|
| Correct | Green | Right pitch, timing ≤150ms |
| Late/Early | Yellow/Orange | Right pitch, timing 150-300ms |
| Wrong | Red | Wrong pitch played |
| Missed | Gray | Note never played (after playhead passes) |
| Unplayed | Black (default) | Note not yet attempted |

### Visual Treatment

- Color applied to **notehead and stem** (not just notehead)
- No additional glow/shadow effects

### Timing

- Notes colored immediately as each note is played
- For chords: color each note as hit (don't wait for full chord)
- Missed notes turn gray when playhead passes them

### Extra Notes

- Notes played that don't exist in score: **no visual feedback** on staff
- (Already tracked in sidebar counter)

### Persistence

- Colors remain until new session starts
- Session end → colors stay for review
- New session start → all notes reset to black

---

## Removed Features

### "Last Note" Sidebar Display

- **Decision**: Remove entirely
- **Rationale**: On-staff coloring provides better contextual feedback
- The note history list in sidebar already shows what was played

---

## Implementation Notes

### Verovio APIs Required

```typescript
// Get time position for a note element
toolkit.getTimeForElement(elementId: string): number

// Get note elements at a specific time
toolkit.getElementsAtTime(time: number): { notes: string[], chords: string[] }

// Get element attributes (for position data)
toolkit.getElementAttr(elementId: string): Record<string, string>
```

### SVG Manipulation

- Verovio renders notes with predictable element IDs
- Use CSS or direct DOM manipulation to change fill colors
- Playhead is an overlay element positioned absolutely

### Timing Calculation

```typescript
// Current timing thresholds (from comparison.ts)
const TIMING_TOLERANCE_MS = 150  // green threshold
const YELLOW_THRESHOLD_MS = 300  // yellow threshold (150-300ms)
// Beyond 300ms with correct pitch = red
```

### State Management

Track per-note:
- Element ID (from Verovio)
- Expected time (from MIDI data)
- Actual played time (null if not played)
- Result: 'correct' | 'late' | 'wrong' | 'missed' | 'pending'

### Repeat Handling

- Parse repeat barlines from MusicXML
- Maintain position in "logical time" (accounting for repeats)
- Map logical time → SVG position for playhead

---

## Implementation Phases

### Phase 1: Note Coloring

1. Create mapping from server note events → Verovio element IDs
2. On note result from server, find corresponding SVG element
3. Apply color class/style to notehead and stem
4. Handle missed notes (gray) when playhead time passes them

### Phase 2: Playhead

1. Parse note positions from Verovio to build time→position map
2. Create playhead overlay element
3. Implement animation loop (60fps)
4. Start playhead on first correct note
5. Handle page turns

### Phase 3: Integration

1. Wire up tempo setting to playhead speed
2. Handle measure range selection
3. Implement repeat handling
4. Polish transitions and edge cases

---

## Open Technical Questions

1. How to reliably map server `NoteEvent` (pitch + timestamp) to Verovio element ID?
   - May need to include element IDs in MusicXML parsing
2. Does Verovio expose X position of notes, or need to query SVG bounding boxes?
3. How to handle grace notes (do they affect playhead position)?
4. System line breaks - does Verovio provide Y position for playhead across systems?
