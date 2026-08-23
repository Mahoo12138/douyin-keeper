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