import type { components } from '@douyin-keeper/sdk-ts'

export type AccountDetailTask = components['schemas']['SparkTask']
export type AccountDetailIntent = components['schemas']['SendIntent']

const PENDING_STATUSES = new Set<AccountDetailIntent['status']>(['pending', 'queued', 'running', 'retry_wait'])

export function tasksForAccount(tasks: AccountDetailTask[], accountId: string) {
	return tasks.filter((task) => task.account_id === accountId)
}

export function flattenPageItems<T>(pages: Array<{ items: T[] }>) {
	return pages.flatMap((page) => page.items)
}

export function summarizeAccountIntents(intents: AccountDetailIntent[]) {
	return intents.reduce(
		(stats, intent) => {
			if (PENDING_STATUSES.has(intent.status)) stats.pending += 1
			if (intent.status === 'succeeded') stats.succeeded += 1
			if (intent.status === 'failed') stats.failed += 1
			if (intent.status === 'skipped' || intent.status === 'cancelled') stats.skipped += 1
			return stats
		},
		{ pending: 0, succeeded: 0, failed: 0, skipped: 0 },
	)
}

export function friendsById<T extends { id: string }>(friends: T[]) {
	return new Map<string, T>(friends.map((friend) => [friend.id, friend]))
}
