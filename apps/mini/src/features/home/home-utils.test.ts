import { describe, expect, it } from 'vitest'

import { createIdempotencyKey, nextEnabledTask, selectAccountId } from './home-utils'

describe('mini home actions', () => {
  it('creates UUID-shaped keys for idempotent manual sends', () => {
    const key = createIdempotencyKey()
    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('keeps a valid account selection and falls back to the first account', () => {
    const accounts = [{ id: 'account-1' }, { id: 'account-2' }]

    expect(selectAccountId(accounts, 'account-2')).toBe('account-2')
    expect(selectAccountId(accounts, 'missing')).toBe('account-1')
    expect(selectAccountId([], 'missing')).toBe('')
  })

  it('only selects an enabled task belonging to the active account', () => {
    const tasks = [
      { id: 'task-other', account_id: 'account-2', enabled: true },
      { id: 'task-disabled', account_id: 'account-1', enabled: false },
      { id: 'task-current', account_id: 'account-1', enabled: true },
    ]

    expect(nextEnabledTask(tasks, 'account-1')?.id).toBe('task-current')
    expect(nextEnabledTask(tasks, 'account-3')).toBeUndefined()
  })
})
