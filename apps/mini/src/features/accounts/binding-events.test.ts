import { describe, expect, it } from 'vitest'

import { bindingEventState, bindingSMSCodeEntryVisible, smsBindingEventState } from './binding-events'

describe('SMS binding event state', () => {
  it('shows the code input when the worker requests a code', () => {
    expect(smsBindingEventState('sms_code_required')).toEqual({
      step: 3,
      status: '验证码已发送，请输入验证码',
      awaitingSMSCode: true,
    })
  })

  it('returns to the code input after an invalid code', () => {
    expect(smsBindingEventState('sms_code_invalid')).toEqual({
      step: 3,
      status: '验证码错误，请重新输入',
      awaitingSMSCode: true,
      error: '验证码错误，请重新输入',
    })
  })

  it('shows pending verification and challenge states immediately', () => {
    expect(bindingEventState('sms_verification_pending')).toEqual({
      step: 4,
      screen: 'progress',
      status: '验证码已提交，等待登录确认',
    })
    expect(bindingEventState('challenge_required')).toEqual({
      step: 4,
      screen: 'progress',
      status: '抖音要求额外安全验证，当前流程无法自动继续，请取消后重试。',
    })
  })

  it('maps QR progress events to the shared binding state', () => {
    expect(bindingEventState('sms_code_required')).toEqual({
      step: 3,
      screen: 'progress',
      status: '验证码已发送，请输入验证码',
      awaitingSMSCode: true,
    })
    expect(bindingEventState('scanned')).toEqual({
      step: 4,
      screen: 'progress',
      status: '二维码已扫描，正在确认登录',
    })
    expect(bindingEventState('success')).toEqual({
      step: 5,
      screen: 'progress',
      status: '绑定成功，正在刷新账号',
    })
  })

  it('shows the code entry for a QR-started job when identity verification requests SMS', () => {
    expect(bindingSMSCodeEntryVisible(true, 'qr-job-id', 3)).toBe(true)
    expect(bindingSMSCodeEntryVisible(false, 'qr-job-id', 3)).toBe(false)
    expect(bindingSMSCodeEntryVisible(true, '', 3)).toBe(false)
    expect(bindingSMSCodeEntryVisible(true, 'qr-job-id', 4)).toBe(false)
  })
})
