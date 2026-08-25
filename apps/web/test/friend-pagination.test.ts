import test from 'node:test'
import assert from 'node:assert/strict'

import { listAllFriendsForAccount } from '../src/features/friends/friend-pagination'

function friend(id: string) {
  return {
    id,
    platform_identity_status: 'resolved' as const,
    display_name: id,
    nickname: '',
    short_id: null,
    avatar_url: null,
    streak_days: 0,
    has_conversation: false,
    spark_enabled: false,
    last_sent_at: null,
  }
}

test('friend pagination loads every cursor page in order', async () => {
  const cursors: (string | undefined)[] = []
  const items = await listAllFriendsForAccount('token', 'account', async (_token, _account, options) => {
    cursors.push(options?.cursor)
    if (!options?.cursor) return { items: [friend('1')], next_cursor: 'cursor-1' }
    if (options.cursor === 'cursor-1') return { items: [friend('2')], next_cursor: 'cursor-2' }
    return { items: [friend('3')], next_cursor: undefined }
  })

  assert.deepEqual(cursors, [undefined, 'cursor-1', 'cursor-2'])
  assert.deepEqual(items.map((item) => item.id), ['1', '2', '3'])
})

test('friend pagination stops when an API repeats a cursor', async () => {
  let calls = 0
  const items = await listAllFriendsForAccount('token', 'account', async () => {
    calls += 1
    return { items: [friend(String(calls))], next_cursor: 'same-cursor' }
  })

  assert.equal(calls, 2)
  assert.deepEqual(items.map((item) => item.id), ['1', '2'])
})
