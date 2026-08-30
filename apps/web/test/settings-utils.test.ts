import test from 'node:test'
import assert from 'node:assert/strict'

import { formatPreferenceUpdatedAt, notificationPreferenceLabel } from '../src/features/settings/settings-utils'
import { changePasswordSchema } from '../src/features/settings/password-validation'

test('notification preference labels preserve the web authorization boundary', () => {
	assert.equal(notificationPreferenceLabel(true), '微信服务通知已授权')
	assert.equal(notificationPreferenceLabel(false), '请在微信小程序中授权开启')
})

test('notification preference dates have a stable empty state', () => {
	assert.equal(formatPreferenceUpdatedAt(null), '尚未记录')
	assert.match(formatPreferenceUpdatedAt('2026-08-24T10:00:00Z'), /2026/)
})

test('password change validation rejects reused and mismatched passwords', () => {
	assert.equal(changePasswordSchema.safeParse({ currentPassword: 'password123', newPassword: 'password123', confirmPassword: 'password123' }).success, false)
	assert.equal(changePasswordSchema.safeParse({ currentPassword: 'password123', newPassword: 'new-password', confirmPassword: 'different' }).success, false)
	assert.equal(changePasswordSchema.safeParse({ currentPassword: 'password123', newPassword: 'new-password', confirmPassword: 'new-password' }).success, true)
})
