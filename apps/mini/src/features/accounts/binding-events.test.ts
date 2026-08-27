import { describe, expect, it } from 'vitest'

import { smsBindingEventState } from './binding-events'

describe('SMS binding event state', () => {
  it('shows the code input when the worker requests a code', () => {
    expect(smsBindingEventState('sms_code_required')).toEqual({
      step: 3,
      status: '验证码已发送，请输入验证码',
    })
  })

  it('returns to the code input after an invalid code', () => {
    expect(smsBindingEventState('sms_code_invalid')).toEqual({
      step: 3,
      status: '验证码错误，请重新输入',
      error: '验证码错误，请重新输入',
    })
  })
})
