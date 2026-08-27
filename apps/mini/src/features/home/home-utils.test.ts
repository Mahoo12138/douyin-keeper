import { describe, expect, it } from 'vitest'

import { createIdempotencyKey, homeAccountStatus, homeOverallStatus, homeTaskStatus, nextEnabledTask, selectAccountId } from './home-utils'

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

  it('prefers a bound account when there is no saved selection', () => {
    const accounts = [{ id: 'pending', binding_status: 'binding' }, { id: 'bound', binding_status: 'bound' }]

    expect(selectAccountId(accounts)).toBe('bound')
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

  it('derives the account status from binding, session and risk fields', () => {
    expect(homeAccountStatus({ binding_status: 'bound', session_status: 'valid', risk_status: 'normal' })).toEqual({ label: '正常', tone: 'green' })
    expect(homeAccountStatus({ binding_status: 'bound', session_status: 'expired', risk_status: 'normal' })).toEqual({ label: '已过期', tone: 'amber' })
    expect(homeAccountStatus({ binding_status: 'bound', session_status: 'valid', risk_status: 'paused' })).toEqual({ label: '已暂停', tone: 'amber' })
    expect(homeAccountStatus(null)).toEqual({ label: '未绑定', tone: 'amber' })
  })

  it('marks the home system as needing attention for failed work or unavailable data', () => {
    const account = homeAccountStatus({ binding_status: 'bound', session_status: 'valid', risk_status: 'normal' })
    const tasks = homeTaskStatus(['failed'])

    expect(tasks).toEqual({ label: '有异常', tone: 'amber' })
    expect(homeOverallStatus(account, homeTaskStatus([]), true)).toEqual({ label: '全部正常', tone: 'green' })
    expect(homeOverallStatus(account, tasks, true)).toEqual({ label: '需要关注', tone: 'amber' })
    expect(homeOverallStatus(account, homeTaskStatus([]), false)).toEqual({ label: '需要关注', tone: 'amber' })
  })
})
