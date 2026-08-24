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
