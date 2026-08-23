// Minimal access-token session (docs/13 §4): the token lives in memory only;
// the web refresh uses the HttpOnly cookie set by the Go backend. On loads
// after a reload, requireAuth calls /auth/refresh to recover the session.
import { ApiError } from '@douyin-keeper/sdk-ts'

let accessToken: string | null = null
const listeners = new Set<(token: string | null) => void>()

export function getToken(): string | null {
  return accessToken
}

export function setToken(token: string | null) {
  accessToken = token
  for (const l of listeners) l(token)
}

export function onTokenChange(fn: (token: string | null) => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** Recover a session from the HttpOnly refresh cookie. */
export async function refreshFromCookie(): Promise<boolean> {
  if (accessToken) return true
  const resp = await fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'same-origin' }).catch(() => null)
  if (!resp?.ok) return false
  const data = (await resp.json()) as { access_token: string }
  setToken(data.access_token)
  return true
}

/** Resolve a usable token, refreshing from the cookie when needed. */
export async function requireAuth(): Promise<string> {
  if (accessToken) return accessToken
  if (await refreshFromCookie()) return accessToken as string
  throw new ApiError('UNAUTHENTICATED', 'please sign in')
}

export async function signOut() {
  await fetch('/api/v1/auth/logout', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken ?? ''}` },
    credentials: 'same-origin',
  }).catch(() => null)
  setToken(null)
}

export function authHeaders(): Record<string, string> {
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {}
}