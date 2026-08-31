export type BindingMethod = 'qr' | 'sms'

const smsPhonePattern = /^\+?[0-9][0-9 ()-]{3,30}$/

export function isSMSPhoneValid(value: string) {
  return smsPhonePattern.test(value.trim())
}

export function bindingMethodLabel(method: BindingMethod) {
  return method === 'sms' ? '短信验证码登录' : '扫码登录'
}

export function bindingErrorMessage(eventType: string, code?: string) {
  if (code === 'ACCOUNT_IDENTITY_MISMATCH') return '登录的抖音账号与当前账号不一致，原有登录态未改变。'
  if (code === 'SESSION_EXPIRED') return '未确认到抖音登录成功，请重新扫码，原有登录态未改变。'
  if (eventType === 'platform_challenge') return '抖音要求额外安全验证，当前流程无法自动继续，请取消后重试。'
  if (code === 'CHALLENGE_REQUIRED' || eventType === 'challenge_required') return '抖音要求额外安全验证，当前流程无法自动继续，请取消后重试。'
  return '账号登录未完成，请稍后重试。'
}
