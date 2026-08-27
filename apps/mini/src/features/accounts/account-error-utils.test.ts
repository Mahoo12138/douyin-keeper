import { describe, expect, it } from 'vitest'

import { accountBindingError } from './account-error-utils'

describe('account binding errors', () => {
  it('explains the account quota limit in Chinese', () => {
    expect(accountBindingError('ACCOUNT_QUOTA_EXCEEDED')).toBe('账号数量已达当前权益上限，请升级配额后再试。')
  })

  it('keeps a safe fallback for unknown errors', () => {
    expect(accountBindingError('UNKNOWN', '绑定失败，请重试。')).toBe('绑定失败，请重试。')
  })
})
