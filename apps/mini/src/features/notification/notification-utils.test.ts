import { describe, expect, it } from 'vitest'

import { notificationBodyLabel, notificationPriorityLabel, notificationReadLabel } from './notification-utils'

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

  it('keeps internal risk codes out of user-facing notification copy', () => {
    expect(notificationBodyLabel('账号出现运行风险：ADAPTER_UNAVAILABLE。')).toBe('账号出现运行风险：发送通道暂不可用。')
    expect(notificationBodyLabel('未知状态：CUSTOM_CODE')).toBe('未知状态：CUSTOM_CODE')
  })
})
