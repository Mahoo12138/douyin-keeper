// Admin console session helpers — same access-token-in-memory model as web.
import { ApiError } from '@douyin-keeper/sdk-ts'

let accessToken: string | null = null

export function getToken(): string | null {
  return accessToken
}

export function setToken(token: string | null) {
  accessToken = token
}

export async function refreshFromCookie(): Promise<boolean> {
  if (accessToken) return true
  const resp = await fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'same-origin' }).catch(() => null)
  if (!resp?.ok) return false
  const data = (await resp.json()) as { access_token: string }
  setToken(data.access_token)
  return true
}

export async function requireAuth(): Promise<string> {
  if (accessToken) return accessToken
  if (await refreshFromCookie()) return accessToken as string
  throw new ApiError('UNAUTHENTICATED', 'please sign in')
}