import test from 'node:test'
import assert from 'node:assert/strict'

import { getToken, setToken, signOut } from '../src/auth/session'

test('signOut revokes the backend session and clears the in-memory token', async () => {
  const originalFetch = globalThis.fetch
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = []

  globalThis.fetch = async (input, init) => {
    calls.push({ input, init })
    return new Response(null, { status: 204 })
  }

  try {
    setToken('admin-session-token')
    await signOut()

    assert.equal(getToken(), null)
    assert.equal(calls.length, 1)
    assert.equal(calls[0]?.input, '/api/v1/auth/logout')
    assert.equal(calls[0]?.init?.method, 'POST')
    assert.equal(calls[0]?.init?.credentials, 'same-origin')
    assert.deepEqual(calls[0]?.init?.headers, { Authorization: 'Bearer admin-session-token' })
  } finally {
    globalThis.fetch = originalFetch
    setToken(null)
  }
})

test('signOut still clears the token when backend logout is unavailable', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => {
    throw new Error('backend unavailable')
  }

  try {
    setToken('stale-session-token')
    await signOut()
    assert.equal(getToken(), null)
  } finally {
    globalThis.fetch = originalFetch
    setToken(null)
  }
})
