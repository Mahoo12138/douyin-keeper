import assert from 'node:assert/strict'
import test from 'node:test'

import { selectableTaskConversations, taskConversationOptions } from '../src/features/tasks/task-targets'
import type { Conversation } from '../src/features/conversations/conversation-pagination'

function conversation(id: string, patch: Partial<Conversation> = {}): Conversation {
  return {
    id,
    friend_id: `${id}-friend`,
    friend_display_name: id,
    friend_nickname: id,
    friend_avatar_url: null,
    streak_days: 0,
    streak_activated_today: null,
    spark_enabled: false,
    last_sent_at: null,
    platform_identity_status: 'resolved',
    conversation_type: 'direct',
    spark_supported: true,
    last_message_at: null,
    last_synced_at: null,
    archived: false,
    archived_at: null,
    ...patch,
  }
}

test('task selector only includes resolved conversations with spark maintenance enabled', () => {
  const items = [
    conversation('enabled', { spark_enabled: true }),
    conversation('enabled', { spark_enabled: true, friend_display_name: 'enabled duplicate' }),
    conversation('disabled'),
    conversation('unsupported', { spark_enabled: true, spark_supported: false }),
    conversation('archived', { spark_enabled: true, archived: true }),
  ]

  assert.deepEqual(selectableTaskConversations(items).map((item) => item.id), ['enabled'])
})

test('task selector uses stable conversation ids and disambiguates same-name sessions', () => {
  const items = [
    conversation('group-a', { friend_id: 'group-a-friend', friend_display_name: '群聊', friend_nickname: '群聊', conversation_type: 'group', spark_enabled: true }),
    conversation('group-b', { friend_id: 'group-b-friend', friend_display_name: '群聊', friend_nickname: '群聊', conversation_type: 'group', spark_enabled: true }),
    conversation('group-a-duplicate', { friend_id: 'group-a-friend', friend_display_name: '群聊', friend_nickname: '群聊', conversation_type: 'group', spark_enabled: true }),
  ]

  const selectable = selectableTaskConversations(items)
  assert.deepEqual(selectable.map((item) => item.id), ['group-a', 'group-b'])
  assert.deepEqual(taskConversationOptions(selectable), [
    { value: 'group-a', label: '群聊 · 会话 1' },
    { value: 'group-b', label: '群聊 · 会话 2' },
  ])
})

test('task editor retains its current conversation even after maintenance is disabled', () => {
  const items = [conversation('enabled', { spark_enabled: true }), conversation('current')]

  assert.deepEqual(selectableTaskConversations(items, 'current').map((item) => item.id), ['enabled', 'current'])
})
