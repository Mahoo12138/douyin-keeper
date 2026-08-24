import assert from 'node:assert/strict'
import test from 'node:test'

import {
	countIntentsByAccount,
	countTasksByAccount,
	summarizeAccounts,
	summarizeIntents,
	todayRange,
} from '../src/features/dashboard/dashboard-utils.ts'

test('summarizeAccounts separates binding, session, and risk states', () => {
	const stats = summarizeAccounts([
		{ binding_status: 'bound', session_status: 'valid', risk_status: 'normal' },
		{ binding_status: 'bound', session_status: 'expired', risk_status: 'normal' },
		{ binding_status: 'bound', session_status: 'valid', risk_status: 'paused' },
		{ binding_status: 'binding', session_status: 'unknown', risk_status: 'cooling_down' },
	] as never[])

	assert.deepEqual(stats, { bound: 3, valid: 2, expired: 1, paused: 1 })
})

test('summarizeIntents counts today states and picks the next pending intent', () => {
	const now = new Date('2026-08-24T10:00:00Z')
	const intents = [
		{ account_id: 'a', status: 'succeeded', scheduled_at: '2026-08-24T09:00:00Z' },
		{ account_id: 'a', status: 'failed', scheduled_at: '2026-08-24T09:30:00Z' },
		{ account_id: 'b', status: 'queued', scheduled_at: '2026-08-24T11:00:00Z', friend: { display_name: '小乙' }, account: { nickname: '账号 B' } },
		{ account_id: 'c', status: 'pending', scheduled_at: '2026-08-24T10:30:00Z', friend: { display_name: '小甲' }, account: { nickname: '账号 C' } },
		{ account_id: 'd', status: 'cancelled', scheduled_at: '2026-08-24T12:00:00Z' },
	] as never[]

	const stats = summarizeIntents(intents, now)
	assert.equal(stats.pending, 2)
	assert.equal(stats.succeeded, 1)
	assert.equal(stats.failed, 1)
	assert.equal(stats.next?.friend.display_name, '小甲')
})

test('account counters include only enabled tasks and preserve send status buckets', () => {
	const tasks = [
		{ account_id: 'a', enabled: true },
		{ account_id: 'a', enabled: false },
		{ account_id: 'b', enabled: true },
	] as never[]
	const intents = [
		{ account_id: 'a', status: 'succeeded' },
		{ account_id: 'a', status: 'running' },
		{ account_id: 'a', status: 'failed' },
	] as never[]

	assert.equal(countTasksByAccount(tasks).get('a'), 1)
	assert.deepEqual(countIntentsByAccount(intents).get('a'), { pending: 1, succeeded: 1, failed: 1, next: intents[1] })
})

test('todayRange uses the product Asia/Shanghai day boundary', () => {
	const range = todayRange(new Date('2026-08-24T18:00:00Z'))
	assert.equal(range.day, '2026-08-25')
	assert.equal(range.from, '2026-08-24T16:00:00.000Z')
	assert.equal(range.to, '2026-08-25T16:00:00.000Z')
})
