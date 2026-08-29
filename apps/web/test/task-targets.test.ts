import assert from 'node:assert/strict'
import test from 'node:test'

import { selectableTaskConversations } from '../src/features/tasks/task-targets'
import type { Friend } from '../src/features/tasks/task-types'

function conversation(id: string, patch: Partial<Friend> = {}): Friend {
  return {
    id,
    display_name: id,
    nickname: id,
    platform_identity_status: 'resolved',
    streak_days: 0,
    has_conversation: true,
    spark_enabled: false,
    ...patch,
  }
}

test('task selector only includes resolved conversations with spark maintenance enabled', () => {
  const items = [
    conversation('enabled', { spark_enabled: true }),
    conversation('enabled', { spark_enabled: true, display_name: 'enabled duplicate' }),
    conversation('disabled'),
    conversation('not-a-conversation', { spark_enabled: true, has_conversation: false }),
    conversation('unresolved', { spark_enabled: true, platform_identity_status: 'pending' }),
  ]

  assert.deepEqual(selectableTaskConversations(items).map((item) => item.id), ['enabled'])
})

test('task editor retains its current conversation even after maintenance is disabled', () => {
  const items = [conversation('enabled', { spark_enabled: true }), conversation('current')]

  assert.deepEqual(selectableTaskConversations(items, 'current').map((item) => item.id), ['enabled', 'current'])
})
