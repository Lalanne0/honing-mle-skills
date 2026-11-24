import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from './client'
import { useApi } from './useApi'

function deferred<T>() {
  let resolve: (value: T) => void = () => {}
  let reject: (reason: unknown) => void = () => {}
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('useApi', () => {
  it('is loading, then holds the data', async () => {
    const reply = deferred<string>()
    const { result } = renderHook(() => useApi('a', () => reply.promise))

    expect(result.current.state).toEqual({ status: 'loading' })
    await act(async () => reply.resolve('hello'))

    expect(result.current.state).toEqual({ status: 'ok', data: 'hello' })
  })

  it('holds an ApiError when the load fails', async () => {
    const error = new ApiError('not_found', 'No challenge a')
    const { result } = renderHook(() => useApi('a', () => Promise.reject(error)))

    await waitFor(() => expect(result.current.state).toEqual({ status: 'error', error }))
  })

  it('wraps anything else that is thrown as a server error', async () => {
    const { result } = renderHook(() => useApi('a', () => Promise.reject(new Error('bug'))))

    await waitFor(() => expect(result.current.state.status).toBe('error'))
    const { error } = result.current.state as { error: ApiError }
    expect(error).toBeInstanceOf(ApiError)
    expect(error.kind).toBe('server')
    expect(error.message).toBe('bug')
  })

  it('loads again on retry', async () => {
    const load = vi.fn().mockRejectedValueOnce(new ApiError('network', 'down')).mockResolvedValueOnce('back')
    const { result } = renderHook(() => useApi('a', load))
    await waitFor(() => expect(result.current.state.status).toBe('error'))

    act(() => result.current.retry())

    expect(result.current.state).toEqual({ status: 'loading' })
    await waitFor(() => expect(result.current.state).toEqual({ status: 'ok', data: 'back' }))
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('loads again, and drops the old reply, when the key changes', async () => {
    const first = deferred<string>()
    const second = deferred<string>()
    const load = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const { result, rerender } = renderHook(({ key }) => useApi(key, load), { initialProps: { key: 'a' } })

    rerender({ key: 'b' })
    await act(async () => first.resolve('stale'))
    expect(result.current.state).toEqual({ status: 'loading' })

    await act(async () => second.resolve('fresh'))
    expect(result.current.state).toEqual({ status: 'ok', data: 'fresh' })
  })

  it('aborts the load when the component unmounts', () => {
    let signal: AbortSignal | undefined
    const { unmount } = renderHook(() =>
      useApi('a', (s) => {
        signal = s
        return new Promise(() => {})
      }),
    )

    unmount()

    expect(signal?.aborted).toBe(true)
  })
})
