import test from 'node:test'
import assert from 'node:assert/strict'

import { formatPreferenceUpdatedAt, notificationPreferenceLabel } from '../src/features/settings/settings-utils'

test('notification preference labels preserve the web authorization boundary', () => {
	assert.equal(notificationPreferenceLabel(true), '微信服务通知已授权')
	assert.equal(notificationPreferenceLabel(false), '请在微信小程序中授权开启')
})

test('notification preference dates have a stable empty state', () => {
	assert.equal(formatPreferenceUpdatedAt(null), '尚未记录')
	assert.match(formatPreferenceUpdatedAt('2026-08-24T10:00:00Z'), /2026/)
})
