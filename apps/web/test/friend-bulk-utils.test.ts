import assert from 'node:assert/strict'
import test from 'node:test'

import {
  isValidBulkWindow,
  normalizeTimeInput,
  selectAllResolvedFriends,
  tasksForSelectedFriends,
  toggleSelectedFriend,
} from '../src/features/friends/friend-bulk-utils.ts'

test('selection helpers only select resolved friends and toggle idempotently', () => {
  const friends = [
    { id: 'resolved', platform_identity_status: 'resolved' },
    { id: 'pending', platform_identity_status: 'pending' },
  ] as never[]

  assert.deepEqual(selectAllResolvedFriends(friends), ['resolved'])
  assert.deepEqual(toggleSelectedFriend(['resolved'], 'resolved', true), ['resolved'])
  assert.deepEqual(toggleSelectedFriend(['resolved'], 'resolved', false), [])
  assert.deepEqual(toggleSelectedFriend([], 'resolved', true), ['resolved'])
})

test('selected task helper stays inside the active account and selected friends', () => {
  const tasks = [
    { id: 't1', account_id: 'a', friend_id: 'f1' },
    { id: 't2', account_id: 'a', friend_id: 'f2' },
    { id: 't3', account_id: 'b', friend_id: 'f1' },
  ] as never[]

  assert.deepEqual(tasksForSelectedFriends(tasks, 'a', ['f1']).map((task) => task.id), ['t1'])
})

test('bulk time window normalizes HTML time inputs and rejects midnight wrap', () => {
  assert.equal(normalizeTimeInput('19:30'), '19:30:00')
  assert.equal(normalizeTimeInput('19:30:00'), '19:30:00')
  assert.equal(isValidBulkWindow('19:30', '22:30'), true)
  assert.equal(isValidBulkWindow('22:30', '01:00'), false)
  assert.equal(isValidBulkWindow('bad', '22:30'), false)
})
