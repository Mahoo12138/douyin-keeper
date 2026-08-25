import assert from 'node:assert/strict'
import test from 'node:test'

import { getTaskPageState } from '../src/features/tasks/task-page-state'

test('task page keeps loading ahead of empty and error states', () => {
	assert.equal(getTaskPageState({ accountsLoading: true, accountsError: false, tasksLoading: false, tasksError: false, accountCount: 0 }), 'loading')
	assert.equal(getTaskPageState({ accountsLoading: false, accountsError: false, tasksLoading: true, tasksError: true, accountCount: 0 }), 'loading')
})

test('task page surfaces account failures instead of showing onboarding empty state', () => {
	assert.equal(getTaskPageState({ accountsLoading: false, accountsError: true, tasksLoading: false, tasksError: false, accountCount: 0 }), 'accounts-error')
})

test('task page gives task failures a retryable state before ready and empty states', () => {
	assert.equal(getTaskPageState({ accountsLoading: false, accountsError: false, tasksLoading: false, tasksError: true, accountCount: 2 }), 'tasks-error')
	assert.equal(getTaskPageState({ accountsLoading: false, accountsError: false, tasksLoading: false, tasksError: false, accountCount: 0 }), 'empty')
	assert.equal(getTaskPageState({ accountsLoading: false, accountsError: false, tasksLoading: false, tasksError: false, accountCount: 1 }), 'ready')
})
