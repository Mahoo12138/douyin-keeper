import { describe, expect, it } from 'vitest'

import { passwordChangeError } from './password-change'

describe('password change validation', () => {
  it('requires the current password', () => {
    expect(passwordChangeError('', 'new-password', 'new-password')).toBe('请输入当前密码。')
  })

  it('rejects a reused or mismatched new password', () => {
    expect(passwordChangeError('password123', 'password123', 'password123')).toBe('新密码不能与当前密码相同。')
    expect(passwordChangeError('password123', 'new-password', 'different')).toBe('两次输入的新密码不一致。')
  })

  it('accepts a matching new password within the length policy', () => {
    expect(passwordChangeError('password123', 'new-password', 'new-password')).toBe('')
  })
})
