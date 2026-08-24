export type BindingMethod = 'qr' | 'sms'

const smsPhonePattern = /^\+?[0-9][0-9 ()-]{3,30}$/

export function isSMSPhoneValid(value: string) {
  return smsPhonePattern.test(value.trim())
}

export function bindingMethodLabel(method: BindingMethod) {
  return method === 'sms' ? '短信验证码登录' : '扫码登录'
}
