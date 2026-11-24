import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from './client'
import { useAction } from './useAction'

function controlled<T>() {
  let resolve: (value: T) => void = () => {}
  let reject: (reason: unknown) => void = () => {}
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('useAction', () => {
  it('runs one request at a time and hands the result on', async () => {
    const pending = controlled<string>()
    const send = vi.fn(() => pending.promise)
    const onDone = vi.fn()
    const { result } = renderHook(() => useAction(send, onDone))

    act(() => {
      result.current.run('a')
      result.current.run('b')
    })

    expect(send).toHaveBeenCalledOnce()
    expect(send).toHaveBeenCalledWith('a', expect.any(AbortSignal))
    expect(result.current.state).toEqual({ status: 'running' })

    await act(async () => pending.resolve('done'))

    expect(onDone).toHaveBeenCalledWith('done')
    expect(result.current.state).toEqual({ status: 'idle' })
  })

  it('reports a failure as an ApiError and allows another run', async () => {
    const send = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce('ok')
    const onDone = vi.fn()
    const { result } = renderHook(() => useAction(send, onDone))

    await act(async () => result.current.run(undefined))

    expect(result.current.state).toEqual({ status: 'error', error: expect.any(ApiError) })
    if (result.current.state.status === 'error') expect(result.current.state.error.message).toBe('boom')

    await act(async () => result.current.run(undefined))

    expect(send).toHaveBeenCalledTimes(2)
    expect(onDone).toHaveBeenCalledWith('ok')
  })

  it('cancels the request on unmount and ignores its failure', async () => {
    const pending = controlled<string>()
    let signal: AbortSignal | undefined
    const send = vi.fn((_: void, s: AbortSignal) => {
      signal = s
      return pending.promise
    })
    const { result, unmount } = renderHook(() => useAction(send, () => {}))
    act(() => result.current.run())

    unmount()

    expect(signal?.aborted).toBe(true)
    await act(async () => pending.reject(new Error('aborted')))
    expect(result.current.state).toEqual({ status: 'running' })
  })
})
