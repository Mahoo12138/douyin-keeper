import { describe, expect, it } from 'vitest'

import { AUTH_CONSENT_ERROR, authConsentError, WECHAT_MINI_RUNTIME_ERROR, WECHAT_NOTIFICATION_RUNTIME_ERROR, wechatMiniRuntimeError, wechatNotificationRuntimeError } from './auth-validation'

describe('authentication consent validation', () => {
  it('allows authentication after consent', () => {
    expect(authConsentError(true)).toBe('')
  })

  it('blocks authentication without consent', () => {
    expect(authConsentError(false)).toBe(AUTH_CONSENT_ERROR)
  })

  it('explains that WeChat authentication is unavailable in H5', () => {
    expect(wechatMiniRuntimeError(true)).toBe(WECHAT_MINI_RUNTIME_ERROR)
    expect(wechatMiniRuntimeError(false)).toBe('')
  })

  it('explains that notification authorization is unavailable in H5', () => {
    expect(wechatNotificationRuntimeError(true)).toBe(WECHAT_NOTIFICATION_RUNTIME_ERROR)
    expect(wechatNotificationRuntimeError(false)).toBe('')
  })
})
