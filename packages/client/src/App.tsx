import { useCallback } from "react"
import { Route, Switch } from "wouter"
import { Library, Practice } from "./pages/index.js"
import { useMidi, useAudio, type MidiNoteEvent } from "./hooks/index.js"
import "./styles/tokens.css"

export function App() {
  const { isReady: audioReady, playNote } = useAudio()

  const handleNote = useCallback(
    (event: MidiNoteEvent) => {
      if (event.on && audioReady) {
        playNote(event.pitch, 0.3)
      }
    },
    [audioReady, playNote]
  )

  const midi = useMidi(handleNote)

  return (
    <Switch>
      <Route path="/">
        <Library midi={midi} onSelectDevice={midi.selectDevice} />
      </Route>
      <Route path="/practice/:id">
        <Practice midi={midi} onSelectDevice={midi.selectDevice} />
      </Route>
    </Switch>
  )
}
