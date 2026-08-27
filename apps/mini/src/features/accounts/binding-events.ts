export type SMSBindingEventState = {
  step: 3
  status: string
  error?: string
}

export function smsBindingEventState(eventType: string): SMSBindingEventState | null {
  if (eventType === 'sms_code_required') return { step: 3, status: '验证码已发送，请输入验证码' }
  if (eventType === 'sms_code_invalid') return { step: 3, status: '验证码错误，请重新输入', error: '验证码错误，请重新输入' }
  return null
}
