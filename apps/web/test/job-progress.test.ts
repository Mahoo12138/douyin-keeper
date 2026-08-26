import test from 'node:test'
import assert from 'node:assert/strict'

import { getTerminalJobError } from '../src/lib/job-progress'
import { waitForJobEvents } from '../src/lib/job-progress'

test('maps terminal job errors to stable error-code messages', () => {
  const error = getTerminalJobError({ seq: 3, event_type: 'error', payload: { code: 'SESSION_EXPIRED' } })
  assert.equal(error?.message, 'SESSION_EXPIRED')
  assert.equal(getTerminalJobError({ seq: 4, event_type: 'started', payload: {} }), null)
})

test('provides useful fallbacks for cancelled and un-coded failures', () => {
  assert.equal(getTerminalJobError({ seq: 5, event_type: 'cancelled', payload: {} })?.message, '任务已取消')
  assert.equal(getTerminalJobError({ seq: 6, event_type: 'error', payload: {} })?.message, '任务执行失败')
})

test('settles from replayed SSE success and aborts the stream', async () => {
  const originalFetch = globalThis.fetch
  let aborted = false
  globalThis.fetch = async (_input, init) => {
    init?.signal?.addEventListener('abort', () => { aborted = true })
    return new Response('id: 1\nevent: started\ndata: {}\n\nid: 2\nevent: success\ndata: {}\n\n', {
      headers: { 'content-type': 'text/event-stream' },
    })
  }
  try {
    await waitForJobEvents('token', 'job-1', 1_000)
    assert.equal(aborted, true)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('reconciles a terminal job when the event stream closes before its final event', async () => {
  const originalFetch = globalThis.fetch
  const requests: string[] = []
  globalThis.fetch = async (input) => {
    const url = String(input)
    requests.push(url)
    if (url.includes('/events')) {
      return new Response('', { headers: { 'content-type': 'text/event-stream' } })
    }
    return new Response(JSON.stringify({
      id: 'job-1', type: 'account.friends_sync.browser', status: 'succeeded', cancelable: false,
      error_code: null, created_at: '2026-08-26T00:00:00Z', started_at: null, finished_at: '2026-08-26T00:00:01Z', cancel_requested_at: null,
    }), { headers: { 'content-type': 'application/json' } })
  }
  try {
    await waitForJobEvents('token', 'job-1', 1)
    assert.equal(requests.some((url) => url.includes('/jobs/job-1')), true)
  } finally {
    globalThis.fetch = originalFetch
  }
})
