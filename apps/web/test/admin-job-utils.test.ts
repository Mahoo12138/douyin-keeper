import test from 'node:test'
import assert from 'node:assert/strict'

import { adminJobTypeLabel, adminJobTypeOptions } from '../src/features/admin/admin-job-utils'

test('admin job type presets include platform archive and preserve contract values', () => {
  const platformArchive = adminJobTypeOptions.find((option) => option.value === 'conversation.archive.browser')
  assert.deepEqual(platformArchive, { value: 'conversation.archive.browser', label: '平台会话归档' })
})

test('admin job type labels fall back to unknown types for forward compatibility', () => {
  assert.equal(adminJobTypeLabel('future.job.type'), 'future.job.type')
  assert.equal(adminJobTypeLabel('send.protocol'), 'Protocol 发送')
})
