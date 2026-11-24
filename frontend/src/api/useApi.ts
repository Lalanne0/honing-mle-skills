import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from './client'

type Settled<T> = { status: 'ok'; data: T } | { status: 'error'; error: ApiError }
export type ApiState<T> = { status: 'loading' } | Settled<T>

const LOADING = { status: 'loading' } as const

/**
 * Run `load` when the component mounts and whenever `key` changes, and on `retry`.
 * The load gets a signal that aborts when it is superseded or the component unmounts,
 * and a superseded reply is dropped.
 */
export function useApi<T>(key: string, load: (signal: AbortSignal) => Promise<T>) {
  const [attempt, setAttempt] = useState(0)
  const [settled, setSettled] = useState<{ id: string; result: Settled<T> } | null>(null)
  const latestLoad = useRef(load)
  useEffect(() => {
    latestLoad.current = load
  })

  const id = `${attempt}:${key}`
  useEffect(() => {
    const controller = new AbortController()
    void latestLoad
      .current(controller.signal)
      .then(
        (data): Settled<T> => ({ status: 'ok', data }),
        (error: unknown): Settled<T> => ({ status: 'error', error: asApiError(error) }),
      )
      .then((result) => {
        if (!controller.signal.aborted) setSettled({ id, result })
      })
    return () => controller.abort()
  }, [id])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])
  const state: ApiState<T> = settled?.id === id ? settled.result : LOADING
  return { state, retry }
}

function asApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error
  return new ApiError('server', error instanceof Error ? error.message : String(error))
}
