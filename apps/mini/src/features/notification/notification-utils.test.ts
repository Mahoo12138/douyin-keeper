import { describe, expect, it } from 'vitest'

import { notificationPriorityLabel, notificationReadLabel } from './notification-utils'

describe('mini notification helpers', () => {
  it('labels notification priorities for compact cards', () => {
    expect(notificationPriorityLabel('critical')).toBe('严重')
    expect(notificationPriorityLabel('warning')).toBe('注意')
    expect(notificationPriorityLabel('info')).toBe('提示')
  })

  it('keeps read state explicit', () => {
    expect(notificationReadLabel(null)).toBe('未读')
    expect(notificationReadLabel('2026-08-25T00:00:00Z')).toBe('已读')
  })
})
