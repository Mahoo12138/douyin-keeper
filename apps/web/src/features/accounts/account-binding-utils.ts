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
  if (eventType === 'challenge_required') return '需要完成平台安全验证。'
  return '账号登录未完成，请稍后重试。'
}
