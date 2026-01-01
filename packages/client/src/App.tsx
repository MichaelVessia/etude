import { useCallback } from "react"
import { Route, Switch } from "wouter"
import { Library, Practice } from "./pages/index.js"
import { useMidi, useAudio, type MidiNoteEvent } from "./hooks/index.js"
import "./styles/tokens.css"

export function App() {
  const { isReady: audioReady, playNote } = useAudio()

  // Handle MIDI notes globally
  const handleNote = useCallback(
    (event: MidiNoteEvent) => {
      // Play the note through audio engine
      if (event.on && audioReady) {
        playNote(event.pitch, 0.3)
      }
    },
    [audioReady, playNote]
  )

  const midi = useMidi(handleNote)

  // Handle device selection
  const handleSelectDevice = useCallback(
    (id: string | null) => {
      midi.selectDevice(id)
    },
    [midi]
  )

  return (
    <Switch>
      <Route path="/">
        <Library midi={midi} onSelectDevice={handleSelectDevice} />
      </Route>
      <Route path="/practice/:id">
        <Practice midi={midi} />
      </Route>
    </Switch>
  )
}
