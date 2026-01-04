import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { Layer, ManagedRuntime } from "effect"
import { SessionRpcClientLive } from "./SessionRpcClient.js"
import { PieceRpcClientLive } from "./PieceRpcClient.js"
import { makeSessionAtoms, type SessionAtoms } from "./sessionAtoms.js"

// App layer with all services
const AppLayer = Layer.mergeAll(SessionRpcClientLive, PieceRpcClientLive)

// Create the managed runtime
export const AppRuntime = ManagedRuntime.make(AppLayer)

// Extract the context type from the runtime
export type AppRuntimeContext = ManagedRuntime.ManagedRuntime.Context<typeof AppRuntime>

// Session atoms - created once at app startup
let sessionAtomsPromise: Promise<SessionAtoms> | null = null

/**
 * Get or create session atoms.
 * Atoms are created lazily on first access.
 */
export function getSessionAtoms(): Promise<SessionAtoms> {
  if (sessionAtomsPromise === null) {
    sessionAtomsPromise = AppRuntime.runPromise(makeSessionAtoms)
  }
  return sessionAtomsPromise
}

// React context for the runtime
const RuntimeContext = createContext<typeof AppRuntime | null>(null)

export interface RuntimeProviderProps {
  readonly children: ReactNode
}

/**
 * Provider component that makes the Effect runtime available to the app.
 * Handles cleanup when unmounted.
 */
export function RuntimeProvider({ children }: RuntimeProviderProps) {
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    // Runtime is created synchronously, but we use this to signal ready state
    setIsReady(true)

    return () => {
      // Dispose runtime on unmount
      void AppRuntime.dispose()
    }
  }, [])

  if (!isReady) {
    return null
  }

  return (
    <RuntimeContext.Provider value={AppRuntime}>
      {children}
    </RuntimeContext.Provider>
  )
}

/**
 * Hook to access the Effect runtime.
 * Must be used within a RuntimeProvider.
 */
export function useRuntime() {
  const runtime = useContext(RuntimeContext)
  if (runtime === null) {
    throw new Error("useRuntime must be used within a RuntimeProvider")
  }
  return runtime
}
