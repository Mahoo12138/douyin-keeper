import assert from 'node:assert/strict'
import test from 'node:test'

import { friendsById, summarizeAccountIntents, tasksForAccount } from '../src/features/accounts/account-detail-utils.ts'

test('tasksForAccount keeps only tasks owned by the account', () => {
	const tasks = [
		{ id: 't1', account_id: 'a', enabled: true },
		{ id: 't2', account_id: 'b', enabled: true },
		{ id: 't3', account_id: 'a', enabled: false },
	] as never[]

	assert.deepEqual(tasksForAccount(tasks, 'a').map((task) => task.id), ['t1', 't3'])
})

test('summarizeAccountIntents keeps pending and terminal states separate', () => {
	const stats = summarizeAccountIntents([
		{ status: 'pending' },
		{ status: 'running' },
		{ status: 'succeeded' },
		{ status: 'failed' },
		{ status: 'skipped' },
		{ status: 'cancelled' },
	] as never[])

	assert.deepEqual(stats, { pending: 2, succeeded: 1, failed: 1, skipped: 2 })
})

test('friendsById provides stable lookup for task rows', () => {
	const friends = [{ id: 'f1', display_name: '小甲' }, { id: 'f2', display_name: '小乙' }]

	assert.equal(friendsById(friends).get('f2')?.display_name, '小乙')
})
