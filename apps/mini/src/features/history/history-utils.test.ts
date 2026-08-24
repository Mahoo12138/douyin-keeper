import { describe, expect, it } from 'vitest'

import { dayKey, filterHistory, localDayRange, recentDays, taskLabel, type HistoryItem } from './history-utils'

function makeItem(status: HistoryItem['status'], taskBody: string | null = null): HistoryItem {
  return {
    id: `${status}-1`,
    intent_type: 'scheduled',
    account_id: 'account-1',
    friend_id: 'friend-1',
    task_id: taskBody ? 'task-1' : null,
    task: taskBody ? { id: 'task-1', message_kind: 'text', body: taskBody } : null,
    local_date: '2026-08-24',
    status,
    error_code: null,
    scheduled_at: '2026-08-24T12:00:00Z',
    created_at: '2026-08-24T12:00:00Z',
    account: { id: 'account-1', nickname: '主账号' },
    friend: { id: 'friend-1', display_name: '好友' },
    latest_job: null,
  }
}

describe('history view helpers', () => {
  it('groups active and skipped statuses for mobile filters', () => {
    const items = [makeItem('queued'), makeItem('failed'), makeItem('cancelled'), makeItem('succeeded')]

    expect(filterHistory(items, 'active')).toHaveLength(1)
    expect(filterHistory(items, 'failed')).toHaveLength(1)
    expect(filterHistory(items, 'skipped')).toHaveLength(1)
  })

  it('labels task body and falls back to task or temporary send', () => {
    expect(taskLabel(makeItem('succeeded', '晚间问候'))).toBe('晚间问候')
    expect(taskLabel({ ...makeItem('succeeded'), task_id: '12345678-abcd', task: null })).toBe('任务 12345678')
    expect(taskLabel({ ...makeItem('succeeded'), task_id: null, task: null })).toBe('临时发送')
  })

  it('creates descending local day keys and an exclusive next-day range', () => {
    const today = new Date(2026, 7, 24, 12)

    expect(recentDays(today, 3)).toEqual(['2026-08-24', '2026-08-23', '2026-08-22'])
    expect(dayKey(new Date(2026, 7, 24))).toBe('2026-08-24')
    expect(localDayRange('2026-08-24').from).not.toBe(localDayRange('2026-08-24').to)
  })
})
