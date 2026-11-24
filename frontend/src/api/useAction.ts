import { useEffect, useRef, useState } from 'react'
import type { ApiError } from './client'
import { asApiError } from './useApi'

export type ActionStatus = { status: 'idle' } | { status: 'running' } | { status: 'error'; error: ApiError }

/**
 * Run a request on demand, one at a time. A second `run` while one is in flight is
 * ignored, even within the same click, so a double click sends one request. The request
 * is cancelled if the component unmounts, and a cancelled reply is dropped.
 */
export function useAction<A, T>(send: (arg: A, signal: AbortSignal) => Promise<T>, onDone: (result: T) => void) {
  const [state, setState] = useState<ActionStatus>({ status: 'idle' })
  const inFlight = useRef<AbortController | null>(null)
  useEffect(() => () => inFlight.current?.abort(), [])

  const run = (arg: A) => {
    if (inFlight.current) return
    const controller = new AbortController()
    inFlight.current = controller
    setState({ status: 'running' })
    void send(arg, controller.signal).then(
      (result) => {
        inFlight.current = null
        if (controller.signal.aborted) return
        setState({ status: 'idle' })
        onDone(result)
      },
      (error: unknown) => {
        inFlight.current = null
        if (!controller.signal.aborted) setState({ status: 'error', error: asApiError(error) })
      },
    )
  }
  return { state, run }
}
