import { beforeEach, describe, expect, it, vi } from 'vitest'

const storage = vi.hoisted(() => new Map<string, unknown>())

vi.mock('@tarojs/taro', () => ({
  default: {
    getStorageSync: (key: string) => storage.get(key),
    setStorageSync: (key: string, value: unknown) => storage.set(key, value),
    removeStorageSync: (key: string) => storage.delete(key),
  },
}))

import { clearSession, getAccessToken, getRefreshToken, setSession } from '../src/lib/session'

describe('mini auth session storage', () => {
  beforeEach(() => storage.clear())

  it('stores and reads both access and refresh tokens', () => {
    setSession({ access_token: 'access-1', refresh_token: 'refresh-1' })

    expect(getAccessToken()).toBe('access-1')
    expect(getRefreshToken()).toBe('refresh-1')
  })

  it('removes a stale refresh token when a session has no refresh token', () => {
    setSession({ access_token: 'access-1', refresh_token: 'refresh-1' })
    setSession({ access_token: 'access-2', refresh_token: null })

    expect(getAccessToken()).toBe('access-2')
    expect(getRefreshToken()).toBeNull()
  })

  it('clears both tokens together', () => {
    setSession({ access_token: 'access-1', refresh_token: 'refresh-1' })
    clearSession()

    expect(getAccessToken()).toBeNull()
    expect(getRefreshToken()).toBeNull()
  })
})
