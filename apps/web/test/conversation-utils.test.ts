import test from 'node:test'
import assert from 'node:assert/strict'

import { getPlatformArchiveAction } from '../src/features/conversations/conversation-utils'

test('active local conversation requests platform archive', () => {
  assert.deepEqual(getPlatformArchiveAction(false), {
    archived: true,
    label: '请求平台归档',
    confirmLabel: '确定请求平台归档这个会话吗？',
  })
})

test('archived local conversation requests platform restore', () => {
  assert.deepEqual(getPlatformArchiveAction(true), {
    archived: false,
    label: '请求平台恢复',
    confirmLabel: '确定请求平台恢复这个会话吗？',
  })
})
