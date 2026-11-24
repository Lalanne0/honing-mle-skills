/**
 * A thin, typed fetch wrapper for the backend.
 *
 * Every request has a deadline that covers both the response and reading its body.
 * Every failure becomes an `ApiError` with a `kind` the UI can switch on; a deadline
 * that expires is a `network` error, like a server that can't be reached.
 */
import type { components } from './schema'

type Schemas = components['schemas']
export type ChallengePublic = Schemas['ChallengePublic']
export type ChallengeRevealed = Schemas['ChallengeRevealed']
export type CreateChallenge = Schemas['CreateChallenge']
export type Level = Schemas['Level']
export type Topic = Schemas['Topic']

export type ApiErrorKind = 'network' | 'not_found' | 'conflict' | 'invalid' | 'model_failed' | 'busy' | 'server'

export class ApiError extends Error {
  readonly kind: ApiErrorKind
  readonly status?: number
  readonly retryAfterSeconds?: number

  constructor(kind: ApiErrorKind, message: string, details: { status?: number; retryAfterSeconds?: number } = {}) {
    super(message)
    this.name = 'ApiError'
    this.kind = kind
    this.status = details.status
    this.retryAfterSeconds = details.retryAfterSeconds
  }
}

/** Deadline for plain reads and writes. */
export const DEFAULT_TIMEOUT_MS = 15_000
/** Deadline for requests that wait on the model, which may retry once on an invalid reply. */
export const MODEL_TIMEOUT_MS = 120_000

export type RequestOptions = {
  method?: 'GET' | 'POST'
  body?: unknown
  timeoutMs?: number
  /** Aborts the request early, for example when the page that asked for it goes away. */
  signal?: AbortSignal
}

const KIND_BY_STATUS: Record<number, ApiErrorKind> = {
  404: 'not_found',
  409: 'conflict',
  422: 'invalid',
  502: 'model_failed',
  503: 'busy',
}

const TIMED_OUT = 'timeout'

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(TIMED_OUT), options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  const cancel = () => controller.abort()
  if (options.signal?.aborted) cancel()
  options.signal?.addEventListener('abort', cancel)
  try {
    const response = await fetch(path, init(options, controller.signal))
    return (await read(response)) as T
  } catch (error) {
    throw asApiError(error, controller.signal)
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', cancel)
  }
}

function init({ method = 'GET', body }: RequestOptions, signal: AbortSignal): RequestInit {
  if (body === undefined) return { method, signal }
  return { method, signal, body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }
}

async function read(response: Response): Promise<unknown> {
  const text = await response.text()
  const body = parse(text)
  if (!response.ok) throw statusError(response, body)
  if (body === UNREADABLE) throw new ApiError('server', 'The server sent a reply the app could not read.')
  return body
}

const UNREADABLE = Symbol('unreadable')

function parse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return UNREADABLE
  }
}

function statusError(response: Response, body: unknown): ApiError {
  const kind = KIND_BY_STATUS[response.status] ?? 'server'
  const message = detailOf(body) ?? `The server answered with status ${response.status}.`
  return new ApiError(kind, message, { status: response.status, retryAfterSeconds: retryAfter(response) })
}

/** FastAPI sends `detail` as a string, or as a list of validation errors for a 422. */
function detailOf(body: unknown): string | undefined {
  const detail = (body as { detail?: unknown } | null)?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) return detail.map(validationMessage).join(' ')
  return undefined
}

function validationMessage(item: { loc?: unknown[]; msg?: string }): string {
  const field = item.loc?.filter((part) => part !== 'body').join('.')
  return field ? `${field}: ${item.msg}.` : `${item.msg}.`
}

function retryAfter(response: Response): number | undefined {
  const seconds = Number.parseInt(response.headers.get('Retry-After') ?? '', 10)
  return Number.isNaN(seconds) ? undefined : seconds
}

function asApiError(error: unknown, signal: AbortSignal): ApiError {
  if (error instanceof ApiError) return error
  if (signal.reason === TIMED_OUT) return new ApiError('network', 'The server took too long to answer.')
  if (signal.aborted) return new ApiError('network', 'The request was cancelled.')
  return new ApiError('network', 'The server could not be reached.')
}

export const api = {
  createChallenge: (body: CreateChallenge, signal?: AbortSignal) =>
    request<ChallengePublic>('/api/challenges', { method: 'POST', body, timeoutMs: MODEL_TIMEOUT_MS, signal }),
  getChallenge: (id: string, signal?: AbortSignal) =>
    request<ChallengePublic | ChallengeRevealed>(`/api/challenges/${encodeURIComponent(id)}`, { method: 'GET', signal }),
}
