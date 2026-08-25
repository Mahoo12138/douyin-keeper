import test from 'node:test'
import assert from 'node:assert/strict'

import { friendOptionsFromFriends } from '../src/features/history/history-utils'

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
