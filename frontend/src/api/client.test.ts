import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, DEFAULT_TIMEOUT_MS, MODEL_TIMEOUT_MS, api, request } from './client'

function json(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' }, ...init })
}

function stubFetch(impl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  const fetchMock = vi.fn(impl)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function failure(promise: Promise<unknown>): Promise<ApiError> {
  const error: unknown = await promise.then(
    () => {
      throw new Error('expected the request to fail')
    },
    (reason: unknown) => reason,
  )
  expect(error).toBeInstanceOf(ApiError)
  return error as ApiError
}

/** A fetch that never settles on its own and rejects like the browser when its signal aborts. */
function hangingFetch(_: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return new Promise((_resolve, reject) => {
    const abort = () => reject(new DOMException('aborted', 'AbortError'))
    if (init?.signal?.aborted) abort()
    init?.signal?.addEventListener('abort', abort)
  })
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('request', () => {
  it('returns the parsed body of a successful response', async () => {
    stubFetch(() => Promise.resolve(json({ status: 'ok' })))

    await expect(request('/api/health')).resolves.toEqual({ status: 'ok' })
  })

  it('sends a JSON body with a JSON content type', async () => {
    const fetchMock = stubFetch(() => Promise.resolve(json({}, { status: 201 })))

    await request('/api/challenges', { method: 'POST', body: { level: 'mid' } })

    const init = fetchMock.mock.calls[0][1]
    expect(init?.method).toBe('POST')
    expect(init?.body).toBe('{"level":"mid"}')
    expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json')
  })

  it('maps 409 to a conflict and keeps the server detail', async () => {
    stubFetch(() => Promise.resolve(json({ detail: 'The challenge is already revealed.' }, { status: 409 })))

    const error = await failure(request('/api/x'))

    expect(error.kind).toBe('conflict')
    expect(error.status).toBe(409)
    expect(error.message).toBe('The challenge is already revealed.')
  })

  it('maps 422 to invalid and joins the validation messages', async () => {
    const detail = [
      { loc: ['body', 'level'], msg: 'Input should be junior, mid or senior', type: 'enum' },
      { loc: ['body', 'topic'], msg: 'Extra inputs are not permitted', type: 'extra' },
    ]
    stubFetch(() => Promise.resolve(json({ detail }, { status: 422 })))

    const error = await failure(request('/api/x'))

    expect(error.kind).toBe('invalid')
    expect(error.status).toBe(422)
    expect(error.message).toBe(
      'level: Input should be junior, mid or senior. topic: Extra inputs are not permitted.',
    )
  })

  it('leaves out the field for a 422 about the body as a whole', async () => {
    stubFetch(() =>
      Promise.resolve(json({ detail: [{ loc: ['body'], msg: 'JSON decode error', type: 'json_invalid' }] }, { status: 422 })),
    )

    expect((await failure(request('/api/x'))).message).toBe('JSON decode error.')
  })

  it('maps 502 to a failed model call', async () => {
    stubFetch(() =>
      Promise.resolve(json({ detail: 'The model call failed, so nothing was saved: boom' }, { status: 502 })),
    )

    const error = await failure(request('/api/x'))

    expect(error.kind).toBe('model_failed')
    expect(error.message).toBe('The model call failed, so nothing was saved: boom')
  })

  it('maps 404 to not found', async () => {
    stubFetch(() => Promise.resolve(json({ detail: 'No challenge abc' }, { status: 404 })))

    expect((await failure(request('/api/x'))).kind).toBe('not_found')
  })

  it('maps 503 to busy and reads Retry-After', async () => {
    stubFetch(() =>
      Promise.resolve(json({ detail: 'The model is busy.' }, { status: 503, headers: { 'Retry-After': '12' } })),
    )

    const error = await failure(request('/api/x'))

    expect(error.kind).toBe('busy')
    expect(error.retryAfterSeconds).toBe(12)
  })

  it('leaves Retry-After unset when the header is missing or not a number', async () => {
    stubFetch(() => Promise.resolve(new Response('', { status: 503, headers: { 'Retry-After': 'soon' } })))

    expect((await failure(request('/api/x'))).retryAfterSeconds).toBeUndefined()
  })

  it('maps any other error status to a server error with a fallback message', async () => {
    stubFetch(() => Promise.resolve(new Response('<html>oops</html>', { status: 500 })))

    const error = await failure(request('/api/x'))

    expect(error.kind).toBe('server')
    expect(error.status).toBe(500)
    expect(error.message).toBe('The server answered with status 500.')
  })

  it('treats an unreadable success body as a server error', async () => {
    stubFetch(() => Promise.resolve(new Response('not json', { status: 200 })))

    const error = await failure(request('/api/x'))

    expect(error.kind).toBe('server')
    expect(error.message).toBe('The server sent a reply the app could not read.')
  })

  it('maps a failed fetch to a network error', async () => {
    stubFetch(() => Promise.reject(new TypeError('Failed to fetch')))

    const error = await failure(request('/api/x'))

    expect(error.kind).toBe('network')
    expect(error.status).toBeUndefined()
    expect(error.message).toBe('The server could not be reached.')
  })

  it('aborts at the deadline while waiting for the response, as a network error', async () => {
    vi.useFakeTimers()
    const fetchMock = stubFetch(hangingFetch)

    const pending = failure(request('/api/x', { timeoutMs: 1000 }))
    await vi.advanceTimersByTimeAsync(1000)
    const error = await pending

    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true)
    expect(error.kind).toBe('network')
    expect(error.message).toBe('The server took too long to answer.')
  })

  it('aborts at the deadline while reading the body, as a network error', async () => {
    vi.useFakeTimers()
    stubFetch((_, init) => {
      const body = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"status":'))
          init?.signal?.addEventListener('abort', () =>
            controller.error(new DOMException('aborted', 'AbortError')),
          )
        },
      })
      return Promise.resolve(new Response(body, { status: 200 }))
    })

    const pending = failure(request('/api/x', { timeoutMs: 1000 }))
    await vi.advanceTimersByTimeAsync(1000)
    const error = await pending

    expect(error.kind).toBe('network')
    expect(error.message).toBe('The server took too long to answer.')
  })

  it('does not abort a request that finished before the deadline', async () => {
    vi.useFakeTimers()
    const fetchMock = stubFetch(() => Promise.resolve(json({ ok: true })))

    await request('/api/x', { timeoutMs: 1000 })
    await vi.advanceTimersByTimeAsync(5000)

    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(false)
  })

  it("aborts when the caller's signal aborts", async () => {
    const fetchMock = stubFetch(hangingFetch)
    const caller = new AbortController()

    const pending = failure(request('/api/x', { signal: caller.signal }))
    caller.abort()
    const error = await pending

    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true)
    expect(error.kind).toBe('network')
    expect(error.message).toBe('The request was cancelled.')
  })

  it('aborts straight away when the caller passes an already aborted signal', async () => {
    const fetchMock = stubFetch(hangingFetch)

    await failure(request('/api/x', { signal: AbortSignal.abort() }))

    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true)
  })
})

describe('api', () => {
  it('creates a challenge with a POST to /api/challenges', async () => {
    const fetchMock = stubFetch(() => Promise.resolve(json({ id: '1' }, { status: 201 })))

    await api.createChallenge({ level: 'senior', topic: 'model_serving' })

    expect(fetchMock.mock.calls[0][0]).toBe('/api/challenges')
    expect(fetchMock.mock.calls[0][1]?.method).toBe('POST')
    expect(fetchMock.mock.calls[0][1]?.body).toBe('{"level":"senior","topic":"model_serving"}')
  })

  it('gets a challenge by id, escaping the id', async () => {
    const fetchMock = stubFetch(() => Promise.resolve(json({ id: 'a/b' })))

    await api.getChallenge('a/b')

    expect(fetchMock.mock.calls[0][0]).toBe('/api/challenges/a%2Fb')
    expect(fetchMock.mock.calls[0][1]?.method).toBe('GET')
  })

  it('posts an answer for a round to the challenge', async () => {
    const fetchMock = stubFetch(() => Promise.resolve(json({ round: {}, state: { kind: 'completed' } })))

    await api.submitAnswer('a/b', { round: 2, answer_md: 'Shard it.' })

    expect(fetchMock.mock.calls[0][0]).toBe('/api/challenges/a%2Fb/answers')
    expect(fetchMock.mock.calls[0][1]?.method).toBe('POST')
    expect(fetchMock.mock.calls[0][1]?.body).toBe('{"round":2,"answer_md":"Shard it."}')
  })

  it('reveals a challenge with a bodyless POST', async () => {
    const fetchMock = stubFetch(() => Promise.resolve(json({ id: 'a/b' })))

    await api.revealChallenge('a/b')

    expect(fetchMock.mock.calls[0][0]).toBe('/api/challenges/a%2Fb/reveal')
    expect(fetchMock.mock.calls[0][1]?.method).toBe('POST')
    expect(fetchMock.mock.calls[0][1]?.body).toBeUndefined()
  })

  it.each([
    ['grading', () => api.submitAnswer('1', { round: 1, answer_md: 'x' })],
    ['revealing', () => api.revealChallenge('1')],
  ])('waits on the model past the plain deadline when %s', async (_, send) => {
    vi.useFakeTimers()
    const fetchMock = stubFetch(hangingFetch)

    const pending = failure(send())
    await vi.advanceTimersByTimeAsync(DEFAULT_TIMEOUT_MS + 1)
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(false)

    await vi.advanceTimersByTimeAsync(MODEL_TIMEOUT_MS)
    expect((await pending).kind).toBe('network')
  })
})
