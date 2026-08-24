import test from 'node:test'
import assert from 'node:assert/strict'

import { getToken, setToken, signOut } from '../src/auth/session'
import { canActivate } from '../src/lib/auth-guard'
import { adminRedirectTarget, clearAdminRole, resolveAdminAccess } from '../src/lib/admin-guard'

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

test('canActivate restores a session from the HttpOnly refresh cookie', async () => {
  const originalFetch = globalThis.fetch
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = []
  globalThis.fetch = async (input, init) => {
    calls.push({ input, init })
    return new Response(JSON.stringify({ access_token: 'refreshed-token' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }

  try {
    setToken(null)
    assert.equal(await canActivate(), true)
    assert.equal(getToken(), 'refreshed-token')
    assert.equal(calls.length, 1)
    assert.equal(calls[0]?.input, '/api/v1/auth/refresh')
    assert.equal(calls[0]?.init?.method, 'POST')
    assert.equal(calls[0]?.init?.credentials, 'same-origin')
  } finally {
    globalThis.fetch = originalFetch
    setToken(null)
  }
})

test('canActivate rejects when refresh cannot recover a session', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(null, { status: 401 })

  try {
    setToken(null)
    assert.equal(await canActivate(), false)
    assert.equal(getToken(), null)
  } finally {
    globalThis.fetch = originalFetch
    setToken(null)
  }
})

test('admin access distinguishes authentication from authorization', async () => {
  assert.equal(adminRedirectTarget('allowed'), null)
  assert.equal(adminRedirectTarget('forbidden'), '/dashboard')
  assert.equal(adminRedirectTarget('unauthenticated'), '/signin')

  try {
    clearAdminRole()
    assert.equal(await resolveAdminAccess({
      authenticate: async () => 'user-session-token',
      getIdentity: async () => ({
        id: '00000000-0000-0000-0000-000000000001',
        display_name: '普通用户',
        role: 'user',
      }),
    }), 'forbidden')
  } finally {
    clearAdminRole()
    setToken(null)
  }
})
