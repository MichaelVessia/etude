# ADR 008: Greedy Note Matching Algorithm

## Status

Accepted

## Context

During a practice session, Etude must determine whether played notes match expected notes from the sheet music. This matching affects:

- Real-time feedback (correct/wrong/extra indicators)
- Final accuracy score
- Timing accuracy calculation

The challenge: piano music often has chords (multiple simultaneous notes), varying tempos, and human timing imprecision. The algorithm must be fast (real-time) and reasonably accurate.

### Alternatives Considered

**1. Machine Learning Approach**

Train a model on human piano performances to learn typical timing variations.

Problems:
- Requires training data (labeled performances)
- Model inference adds latency
- Harder to explain scoring to users ("why was this wrong?")
- Overkill for the matching problem

**2. Dynamic Time Warping (DTW)**

Algorithm commonly used for time-series alignment; handles tempo variations.

Problems:
- Requires complete sequence for alignment (can't score incrementally)
- Computationally expensive for real-time (O(n*m) where n,m are sequence lengths)
- Better suited for overall similarity than note-by-note feedback

**3. Hungarian Algorithm (Optimal Matching)**

Find globally optimal matching between played and expected notes.

Problems:
- Requires all notes before computing match (no real-time feedback)
- O(n^3) complexity
- May produce unintuitive matches that span large time windows

**4. Fixed Time Window Matching**

Each expected note has a window; first played note in window wins.

Problems:
- Doesn't handle tempo drift well
- Adjacent notes in fast passages may have overlapping windows
- Order sensitivity issues

## Decision

Use a greedy matching algorithm with the following rules:

### Matching Logic

For each played note:
1. Find all unmatched expected notes with matching pitch
2. Filter to notes within timing tolerance (300ms of expected time)
3. Select the closest match by timing
4. Mark as matched; record timing offset

```typescript
// Simplified matching logic
function matchNote(played: PlayedNote, expected: ExpectedNote[]): MatchResult {
  const candidates = expected.filter(e =>
    !e.matched &&
    e.pitch === played.pitch &&
    Math.abs(e.time - played.time) < TIMING_TOLERANCE
  )

  if (candidates.length === 0) {
    return { result: "extra" }
  }

  const closest = minBy(candidates, e => Math.abs(e.time - played.time))
  closest.matched = true

  return {
    result: "correct",
    timingOffset: played.time - closest.time
  }
}
```

### Scoring

**Note Accuracy**: `correct_notes / expected_notes`

**Timing Accuracy** (per correct note):
- Within 75ms: 100% (perfect)
- 75-150ms: Linear falloff to 100%
- 150-300ms: Partial credit with steeper falloff
- Beyond 300ms: Would not have matched

**Combined Score**: `0.6 * note_accuracy + 0.4 * timing_accuracy`

### Constants

```typescript
const TIMING_TOLERANCE = 300    // ms - max offset to consider a match
const PERFECT_WINDOW = 75       // ms - full timing credit
const GOOD_WINDOW = 150         // ms - linear falloff threshold
```

## Consequences

### Positive

- **Real-time**: O(n) per note where n is unmatched expected notes
- **Immediate feedback**: Each note matched as played; no waiting
- **Explainable**: Simple rules easy to communicate to users
- **Handles chords**: Multiple notes at same time each match independently
- **Tunable**: Tolerance windows can be adjusted based on user feedback

### Negative

- **Not globally optimal**: Early mismatches can cascade (wrong note "steals" a match)
- **Tempo-naive**: Fixed windows don't adapt to tempo changes mid-piece
- **No recovery**: Once matched, cannot un-match if later note would be better fit
- **Order sensitivity**: Playing notes slightly out of order may cause mismatches

### Neutral

- Parameters (75ms, 150ms, 300ms) are initial guesses; may need tuning
- Could add tempo tracking layer in future without changing core algorithm
- Greedy approach is industry-standard for rhythm games
