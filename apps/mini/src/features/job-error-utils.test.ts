import { describe, expect, it } from 'vitest'

import { jobErrorMessage } from './job-error-utils'

describe('mini job error helpers', () => {
  it('translates stable backend codes to user-facing copy', () => {
    expect(jobErrorMessage('ADAPTER_UNAVAILABLE')).toBe('发送通道暂不可用，请稍后再试。')
    expect(jobErrorMessage('SESSION_EXPIRED', '绑定未完成')).toBe('账号登录状态已过期，请重新登录抖音账号。')
  })

  it('does not expose unknown codes', () => {
    expect(jobErrorMessage('INTERNAL_PRIVATE_CODE', '任务暂时不可用')).toBe('任务暂时不可用')
    expect(jobErrorMessage(null, '绑定未完成')).toBe('绑定未完成')
  })
})
