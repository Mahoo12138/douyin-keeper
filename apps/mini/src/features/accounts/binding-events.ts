export type BindingEventState = {
  step: 3 | 4 | 5
  screen: 'qr' | 'progress'
  status: string
  error?: string
}

export function bindingEventState(eventType: string): BindingEventState | null {
  if (eventType === 'sms_code_required') return { step: 3, screen: 'progress', status: '验证码已发送，请输入验证码' }
  if (eventType === 'sms_code_invalid') return { step: 3, screen: 'progress', status: '验证码错误，请重新输入', error: '验证码错误，请重新输入' }
  if (eventType === 'sms_verification_pending') return { step: 4, screen: 'progress', status: '验证码已提交，等待登录确认' }
  if (eventType === 'scanned') return { step: 4, screen: 'progress', status: '二维码已扫描，正在确认登录' }
  if (eventType === 'confirming') return { step: 4, screen: 'progress', status: '正在获取账号信息' }
  if (eventType === 'platform_challenge' || eventType === 'challenge_required') {
    return { step: 4, screen: 'progress', status: '需要完成抖音安全验证后继续' }
  }
  if (eventType === 'success') return { step: 5, screen: 'progress', status: '绑定成功，正在刷新账号' }
  if (eventType === 'error' || eventType === 'expired') {
    return { step: 4, screen: 'progress', status: '绑定任务未完成，请重试。', error: '绑定任务未完成，请重试。' }
  }
  return null
}

export type SMSBindingEventState = {
  step: 3
  status: string
  error?: string
}

export function smsBindingEventState(eventType: string): SMSBindingEventState | null {
  const state = bindingEventState(eventType)
  if (state?.step === 3) return { step: 3, status: state.status, error: state.error }
  return null
}
