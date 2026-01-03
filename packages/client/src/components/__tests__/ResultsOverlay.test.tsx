import { describe, expect, it, mock, afterEach } from "bun:test"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"
import { ResultsOverlay } from "../ResultsOverlay.js"
import type { SessionEndResult } from "../../hooks/useSession.js"

function createMockResults(overrides: Partial<SessionEndResult> = {}): SessionEndResult {
  return {
    attemptId: "test-attempt-1",
    noteAccuracy: 0.85,
    timingAccuracy: 0.9,
    combinedScore: 0.87, // 0-1 scale (87%)
    leftHandAccuracy: null,
    rightHandAccuracy: null,
    extraNotes: 0,
    missedNotes: [],
    ...overrides,
  }
}

describe("ResultsOverlay", () => {
  afterEach(() => {
    cleanup()
  })

  describe("rendering", () => {
    it("renders session complete title", () => {
      const onDismiss = mock(() => {})
      const onRetry = mock(() => {})

      render(
        <ResultsOverlay
          results={createMockResults()}
          onDismiss={onDismiss}
          onRetry={onRetry}
        />
      )

      expect(screen.getByText("Session Complete")).toBeTruthy()
    })

    it("renders overall score", () => {
      const onDismiss = mock(() => {})
      const onRetry = mock(() => {})

      render(
        <ResultsOverlay
          results={createMockResults({ combinedScore: 0.87 })}
          onDismiss={onDismiss}
          onRetry={onRetry}
        />
      )

      expect(screen.getByText("87")).toBeTruthy()
      expect(screen.getByText("Overall Score")).toBeTruthy()
    })

    it("renders note accuracy", () => {
      const onDismiss = mock(() => {})
      const onRetry = mock(() => {})

      render(
        <ResultsOverlay
          results={createMockResults({ noteAccuracy: 0.85 })}
          onDismiss={onDismiss}
          onRetry={onRetry}
        />
      )

      expect(screen.getByText("Note Accuracy")).toBeTruthy()
      expect(screen.getByText("85%")).toBeTruthy()
    })

    it("renders timing accuracy", () => {
      const onDismiss = mock(() => {})
      const onRetry = mock(() => {})

      render(
        <ResultsOverlay
          results={createMockResults({ timingAccuracy: 0.9 })}
          onDismiss={onDismiss}
          onRetry={onRetry}
        />
      )

      expect(screen.getByText("Timing")).toBeTruthy()
      expect(screen.getByText("90%")).toBeTruthy()
    })

    it("renders action buttons", () => {
      const onDismiss = mock(() => {})
      const onRetry = mock(() => {})

      render(
        <ResultsOverlay
          results={createMockResults()}
          onDismiss={onDismiss}
          onRetry={onRetry}
        />
      )

      expect(screen.getByText("View Sheet")).toBeTruthy()
      expect(screen.getByText("Try Again")).toBeTruthy()
    })
  })

  describe("grade labels", () => {
    it("shows 'Perfect!' for score >= 95", () => {
      const onDismiss = mock(() => {})
      const onRetry = mock(() => {})

      render(
        <ResultsOverlay
          results={createMockResults({ combinedScore: 0.98 })}
          onDismiss={onDismiss}
          onRetry={onRetry}
        />
      )

      expect(screen.getByText("Perfect!")).toBeTruthy()
    })

    it("shows 'Excellent' for score >= 85 and < 95", () => {
      const onDismiss = mock(() => {})
      const onRetry = mock(() => {})

      render(
        <ResultsOverlay
          results={createMockResults({ combinedScore: 0.90 })}
          onDismiss={onDismiss}
          onRetry={onRetry}
        />
      )

      expect(screen.getByText("Excellent")).toBeTruthy()
    })

    it("shows 'Good' for score >= 70 and < 85", () => {
      const onDismiss = mock(() => {})
      const onRetry = mock(() => {})

      render(
        <ResultsOverlay
          results={createMockResults({ combinedScore: 0.75 })}
          onDismiss={onDismiss}
          onRetry={onRetry}
        />
      )

      expect(screen.getByText("Good")).toBeTruthy()
    })

    it("shows 'Keep Practicing' for score >= 50 and < 70", () => {
      const onDismiss = mock(() => {})
      const onRetry = mock(() => {})

      render(
        <ResultsOverlay
          results={createMockResults({ combinedScore: 0.60 })}
          onDismiss={onDismiss}
          onRetry={onRetry}
        />
      )

      expect(screen.getByText("Keep Practicing")).toBeTruthy()
    })

    it("shows 'Try Again' for score < 50", () => {
      const onDismiss = mock(() => {})
      const onRetry = mock(() => {})

      render(
        <ResultsOverlay
          results={createMockResults({ combinedScore: 0.40 })}
          onDismiss={onDismiss}
          onRetry={onRetry}
        />
      )

      // "Try Again" appears as both grade label and button, use getAllByText
      const tryAgainElements = screen.getAllByText("Try Again")
      expect(tryAgainElements.length).toBe(2) // grade label + button
    })
  })

  describe("hand breakdown", () => {
    it("shows hand breakdown when both hands have accuracy", () => {
      const onDismiss = mock(() => {})
      const onRetry = mock(() => {})

      render(
        <ResultsOverlay
          results={createMockResults({
            leftHandAccuracy: 0.82,
            rightHandAccuracy: 0.91,
          })}
          onDismiss={onDismiss}
          onRetry={onRetry}
        />
      )

      expect(screen.getByText("Left Hand")).toBeTruthy()
      expect(screen.getByText("82%")).toBeTruthy()
      expect(screen.getByText("Right Hand")).toBeTruthy()
      expect(screen.getByText("91%")).toBeTruthy()
    })

    it("hides hand breakdown when accuracies are null", () => {
      const onDismiss = mock(() => {})
      const onRetry = mock(() => {})

      render(
        <ResultsOverlay
          results={createMockResults({
            leftHandAccuracy: null,
            rightHandAccuracy: null,
          })}
          onDismiss={onDismiss}
          onRetry={onRetry}
        />
      )

      expect(screen.queryByText("Left Hand")).toBeNull()
      expect(screen.queryByText("Right Hand")).toBeNull()
    })
  })

  describe("extra notes", () => {
    it("shows extra notes count when > 0", () => {
      const onDismiss = mock(() => {})
      const onRetry = mock(() => {})

      render(
        <ResultsOverlay
          results={createMockResults({ extraNotes: 5 })}
          onDismiss={onDismiss}
          onRetry={onRetry}
        />
      )

      expect(screen.getByText("5 extra notes played")).toBeTruthy()
    })

    it("shows singular form for 1 extra note", () => {
      const onDismiss = mock(() => {})
      const onRetry = mock(() => {})

      render(
        <ResultsOverlay
          results={createMockResults({ extraNotes: 1 })}
          onDismiss={onDismiss}
          onRetry={onRetry}
        />
      )

      expect(screen.getByText("1 extra note played")).toBeTruthy()
    })

    it("hides extra notes when count is 0", () => {
      const onDismiss = mock(() => {})
      const onRetry = mock(() => {})

      render(
        <ResultsOverlay
          results={createMockResults({ extraNotes: 0 })}
          onDismiss={onDismiss}
          onRetry={onRetry}
        />
      )

      expect(screen.queryByText(/extra note/)).toBeNull()
    })
  })

  describe("user interactions", () => {
    it("calls onDismiss when View Sheet button clicked", () => {
      const onDismiss = mock(() => {})
      const onRetry = mock(() => {})

      render(
        <ResultsOverlay
          results={createMockResults()}
          onDismiss={onDismiss}
          onRetry={onRetry}
        />
      )

      fireEvent.click(screen.getByText("View Sheet"))

      expect(onDismiss).toHaveBeenCalledTimes(1)
    })

    it("calls onRetry when Try Again button clicked", () => {
      const onDismiss = mock(() => {})
      const onRetry = mock(() => {})

      render(
        <ResultsOverlay
          results={createMockResults()}
          onDismiss={onDismiss}
          onRetry={onRetry}
        />
      )

      fireEvent.click(screen.getByText("Try Again"))

      expect(onRetry).toHaveBeenCalledTimes(1)
    })

    it("calls onDismiss when overlay background clicked", () => {
      const onDismiss = mock(() => {})
      const onRetry = mock(() => {})

      const { container } = render(
        <ResultsOverlay
          results={createMockResults()}
          onDismiss={onDismiss}
          onRetry={onRetry}
        />
      )

      // Click the overlay (first child with overlay class)
      const overlay = container.firstChild as HTMLElement
      fireEvent.click(overlay)

      expect(onDismiss).toHaveBeenCalledTimes(1)
    })

    it("does not call onDismiss when modal content clicked", () => {
      const onDismiss = mock(() => {})
      const onRetry = mock(() => {})

      render(
        <ResultsOverlay
          results={createMockResults()}
          onDismiss={onDismiss}
          onRetry={onRetry}
        />
      )

      // Click on the modal content (the title)
      fireEvent.click(screen.getByText("Session Complete"))

      expect(onDismiss).not.toHaveBeenCalled()
    })
  })
})
