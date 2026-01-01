#!/usr/bin/env bash
# Test session with simulated MIDI input
# Usage: ./test-session.sh [piece-xml-file]

set -e

BASE_URL="${BASE_URL:-http://localhost:3001}"
PIECE_FILE="${1:-$(dirname "$0")/../../client/public/pieces/twinkle.xml}"

echo "=== Etude Session Test ==="
echo "Server: $BASE_URL"
echo "Piece: $PIECE_FILE"
echo

# Import piece
echo "1. Importing piece..."
PIECE_XML=$(cat "$PIECE_FILE")
IMPORT_RESULT=$(curl -s -X POST "$BASE_URL/api/piece/import" \
  -H "Content-Type: application/json" \
  -d "{\"id\": \"test-piece\", \"xml\": $(echo "$PIECE_XML" | jq -Rs .), \"filePath\": \"$PIECE_FILE\"}")

PIECE_ID=$(echo "$IMPORT_RESULT" | jq -r '.id')
PIECE_NAME=$(echo "$IMPORT_RESULT" | jq -r '.name')
NOTE_COUNT=$(echo "$IMPORT_RESULT" | jq -r '.noteCount')
echo "   Imported: $PIECE_NAME (ID: $PIECE_ID, $NOTE_COUNT notes)"
echo

# Start session
echo "2. Starting session..."
SESSION_RESULT=$(curl -s -X POST "$BASE_URL/api/session/start" \
  -H "Content-Type: application/json" \
  -d "{\"pieceId\": \"$PIECE_ID\", \"measureStart\": 1, \"measureEnd\": 99, \"hand\": \"both\", \"tempo\": 100}")

SESSION_ID=$(echo "$SESSION_RESULT" | jq -r '.sessionId')
EXPECTED_COUNT=$(echo "$SESSION_RESULT" | jq -r '.expectedNoteCount')
echo "   Session: $SESSION_ID"
echo "   Expected notes: $EXPECTED_COUNT"
echo

# Get expected notes
echo "3. Getting expected notes..."
EXPECTED=$(curl -s "$BASE_URL/api/session/expected")
echo "   Notes: $(echo "$EXPECTED" | jq -c '.notes[:5]')..."
echo

# Build simulate payload from expected notes (perfect play)
echo "4. Simulating perfect performance..."
SIMULATE_NOTES=$(echo "$EXPECTED" | jq '{notes: [.notes[] | {pitch: .pitch, timestamp: .timestamp}]}')
SIMULATE_RESULT=$(curl -s -X POST "$BASE_URL/api/session/simulate" \
  -H "Content-Type: application/json" \
  -d "$SIMULATE_NOTES")

SUBMITTED=$(echo "$SIMULATE_RESULT" | jq -r '.submitted')
CORRECT=$(echo "$SIMULATE_RESULT" | jq '[.results[] | select(.result == "correct")] | length')
echo "   Submitted: $SUBMITTED notes"
echo "   Correct: $CORRECT"
echo

# End session
echo "5. Ending session..."
END_RESULT=$(curl -s -X POST "$BASE_URL/api/session/end")

NOTE_ACC=$(echo "$END_RESULT" | jq -r '.noteAccuracy * 100 | round')
TIMING_ACC=$(echo "$END_RESULT" | jq -r '.timingAccuracy * 100 | round')
COMBINED=$(echo "$END_RESULT" | jq -r '.combinedScore | round')

echo "   Note Accuracy: $NOTE_ACC%"
echo "   Timing Accuracy: $TIMING_ACC%"
echo "   Combined Score: $COMBINED%"
echo

if [ "$COMBINED" = "100" ]; then
  echo "=== PASS: Perfect score! ==="
else
  echo "=== FAIL: Expected 100%, got $COMBINED% ==="
  exit 1
fi
