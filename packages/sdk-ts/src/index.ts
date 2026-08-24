// Typed client for the Douyin Keeper Go API (generated from packages/contracts).
// All data flows through the Go backend (docs/04 §2.3) — the SDK never talks
// to a Node server.
import createClient from 'openapi-fetch'
import type { paths } from './schema.js'

export type { paths, components } from './schema.js'

/** apiClient points at the Go backend under the same origin (/api/v1). */
export const api = createClient<paths>({ baseUrl: '/api/v1' })

/** Typed helper for the frozen MVP auth call (docs/11 §16). */
export async function login(username: string, password: string) {
  const { data, error } = await api.POST('/auth/login', {
    body: { username, password },
  })
  if (error) throw new ApiError(error.error?.code ?? 'UNKNOWN', error.error?.message ?? 'login failed')
  return data
}

export async function register(username: string, password: string) {
  const { data, error } = await api.POST('/auth/register', {
    body: { username, password },
  })
  if (error) throw new ApiError(error.error?.code ?? 'UNKNOWN', error.error?.message ?? 'register failed')
  return data
}

export async function me(accessToken: string) {
  const { data } = await api.GET('/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!data) throw new ApiError('UNAUTHENTICATED', 'me failed')
  return data
}

export async function redeemCardCode(accessToken: string, code: string) {
  const { data, error } = await api.POST('/entitlements/redeem', {
    headers: { Authorization: `Bearer ${accessToken}` },
    body: { code },
  })
  if (error) throw new ApiError(error.error?.code ?? 'UNKNOWN', error.error?.message ?? 'redeem failed')
  return data
}

export async function myEntitlement(accessToken: string) {
  const { data } = await api.GET('/me/entitlement', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!data) throw new ApiError('NOT_FOUND', 'entitlement failed')
  return data
}

export async function listAccounts(accessToken: string) {
  const { data } = await api.GET('/accounts', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!data) throw new ApiError('NOT_FOUND', 'accounts failed')
  return data
}

export async function createAccountBinding(accessToken: string) {
  const { data, error } = await api.POST('/accounts/bindings', {
    headers: { Authorization: `Bearer ${accessToken}` },
    body: { method: 'qr' },
  })
  if (error) throwApiError(error, 'binding failed')
  return data
}

export async function checkAccountSession(accessToken: string, accountId: string) {
  const { data, error } = await api.POST('/accounts/{accountId}/session-check', {
    headers: { Authorization: `Bearer ${accessToken}` },
    params: { path: { accountId } },
  })
  if (error) throwApiError(error, 'session check failed')
  return data
}

export async function syncAccountFriends(accessToken: string, accountId: string) {
  const { data, error } = await api.POST('/accounts/{accountId}/friends-sync', {
    headers: { Authorization: `Bearer ${accessToken}` },
    params: { path: { accountId } },
  })
  if (error) throwApiError(error, 'friend sync failed')
  return data
}

export async function accountCapabilities(accessToken: string, accountId: string) {
  const { data, error } = await api.GET('/accounts/{accountId}/capabilities', {
    headers: { Authorization: `Bearer ${accessToken}` },
    params: { path: { accountId } },
  })
  if (error) throwApiError(error, 'capabilities failed')
  return data
}

export async function getJob(accessToken: string, jobId: string) {
  const { data, error } = await api.GET('/jobs/{jobId}', {
    headers: { Authorization: `Bearer ${accessToken}` },
    params: { path: { jobId } },
  })
  if (error) throwApiError(error, 'job lookup failed')
  return data
}

export async function cancelJob(accessToken: string, jobId: string) {
  const { data, error } = await api.POST('/jobs/{jobId}/cancel', {
    headers: { Authorization: `Bearer ${accessToken}` },
    params: { path: { jobId } },
  })
  if (error) throwApiError(error, 'job cancellation failed')
  return data
}

export type JobEventEnvelope = {
  seq: number
  event_type: string
  payload: Record<string, unknown>
}

function throwApiError(error: unknown, fallback: string): never {
  const body = error as { error?: { code?: string; message?: string } } | undefined
  throw new ApiError(body?.error?.code ?? 'UNKNOWN', body?.error?.message ?? fallback)
}

/** Streams the replay-first SSE endpoint; callers own AbortController lifetime. */
export async function streamJobEvents(
  accessToken: string,
  jobId: string,
  onEvent: (event: JobEventEnvelope) => void,
  signal?: AbortSignal,
) {
  const response = await fetch(`/api/v1/jobs/${encodeURIComponent(jobId)}/events`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'text/event-stream' },
    signal,
  })
  if (!response.ok) throw new ApiError(`HTTP_${response.status}`, 'job event stream failed')
  if (!response.body) throw new ApiError('STREAM_UNAVAILABLE', 'job event stream is unavailable')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
      const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const frames = buffer.split('\n\n')
    buffer = frames.pop() ?? ''
    for (const frame of frames) {
      const lines = frame.split('\n')
      const eventType = lines.find((line) => line.startsWith('event:'))?.slice(6).trim() ?? 'message'
      const seqValue = lines.find((line) => line.startsWith('id:'))?.slice(3).trim() ?? '0'
      const data = lines.filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).join('\n')
      if (!data) continue
      onEvent({ seq: Number(seqValue) || 0, event_type: eventType, payload: JSON.parse(data) as Record<string, unknown> })
    }
  }
}

/** Error carrying the stable backend error code (docs/11 §13). */
export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}
