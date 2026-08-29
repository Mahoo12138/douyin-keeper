import test from 'node:test'
import assert from 'node:assert/strict'

import { streakBadgePresentation } from '../src/features/friends/friend-status'

test('streak badge color follows today activation instead of streak days alone', () => {
  assert.deepEqual(streakBadgePresentation(372, true), {
    variant: 'success', state: 'activated', statusLabel: '今日已激活',
  })
  assert.deepEqual(streakBadgePresentation(372, false), {
    variant: 'muted', state: 'pending', statusLabel: '今日未激活',
  })
  assert.deepEqual(streakBadgePresentation(372, null), {
    variant: 'warning', state: 'unknown', statusLabel: '今日状态待确认',
  })
  assert.deepEqual(streakBadgePresentation(0, false), {
    variant: 'muted', state: 'none', statusLabel: '尚未形成火花',
  })
})
