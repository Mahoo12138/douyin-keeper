import test from 'node:test'
import assert from 'node:assert/strict'

import { notificationUnreadLabel } from '../src/features/notifications/notification-summary-utils'

test('notification unread badge stays quiet when there are no unread items', () => {
  assert.equal(notificationUnreadLabel(0), undefined)
  assert.equal(notificationUnreadLabel(undefined), undefined)
})

test('notification unread badge caps large counts for compact navigation', () => {
  assert.equal(notificationUnreadLabel(3), '3')
  assert.equal(notificationUnreadLabel(100), '99+')
})
