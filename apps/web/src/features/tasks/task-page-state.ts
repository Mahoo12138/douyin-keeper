export type TaskPageState = 'loading' | 'accounts-error' | 'tasks-error' | 'empty' | 'ready'

export function getTaskPageState(input: {
	accountsLoading: boolean
	accountsError: boolean
	tasksLoading: boolean
	tasksError: boolean
	accountCount: number
}): TaskPageState {
	if (input.accountsLoading || input.tasksLoading) return 'loading'
	if (input.accountsError) return 'accounts-error'
	if (input.tasksError) return 'tasks-error'
	if (input.accountCount === 0) return 'empty'
	return 'ready'
}
