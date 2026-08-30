import assert from 'node:assert/strict'
import test from 'node:test'

import { waitForSendJobResult } from '../src/features/tasks/task-send-status'

test('waits for a send job terminal status', async () => {
  const statuses = ['queued', 'running', 'succeeded']
  const result = await waitForSendJobResult(async () => ({ status: statuses.shift() ?? 'succeeded', error_code: null }), {
    maxAttempts: 4,
    intervalMs: 0,
    sleep: async () => {},
  })
  assert.equal(result?.status, 'succeeded')
})

test('returns the precise failed job and stops polling', async () => {
  let calls = 0
  const result = await waitForSendJobResult(async () => {
    calls += 1
    return { status: 'failed', error_code: 'CONVERSATION_NOT_FOUND' }
  }, { maxAttempts: 4, intervalMs: 0, sleep: async () => {} })
  assert.deepEqual(result, { status: 'failed', error_code: 'CONVERSATION_NOT_FOUND' })
  assert.equal(calls, 1)
})
