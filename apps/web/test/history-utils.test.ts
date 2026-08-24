import test from 'node:test'
import assert from 'node:assert/strict'

import { friendOptionsFromFriends, listAllFriendsForAccount } from '../src/features/history/history-utils'

test('history friend options use stable labels, deduplicate IDs, and sort for selection', () => {
  assert.deepEqual(friendOptionsFromFriends([
    { id: '2', nickname: null, display_name: '赵六' },
    { id: '1', nickname: '阿明', display_name: '明明' },
    { id: '1', nickname: '阿明', display_name: '旧名称' },
  ]), [
    ['1', '阿明'],
    ['2', '赵六'],
  ])
})

test('history friend loading follows cursor pages and stops on a repeated cursor', async () => {
  const cursors: (string | undefined)[] = []
  const items = await listAllFriendsForAccount('token', 'account', async (_token, _account, options) => {
    cursors.push(options?.cursor)
    return options?.cursor ? { items: [{ id: '2', nickname: null, display_name: '乙' }], next_cursor: 'cursor-1' } : { items: [{ id: '1', nickname: null, display_name: '甲' }], next_cursor: 'cursor-1' }
  })

  assert.deepEqual(cursors, [undefined, 'cursor-1'])
  assert.deepEqual(items.map((item) => item.id), ['1', '2'])
})
