export const AUTH_CONSENT_ERROR = '请先阅读并同意《用户协议》和《隐私政策》。'
export const WECHAT_MINI_RUNTIME_ERROR = '微信登录与绑定请在微信小程序中使用，H5 调试请使用账号密码登录。'
export const WECHAT_NOTIFICATION_RUNTIME_ERROR = '微信服务通知需在微信小程序中授权，H5 端可继续使用站内通知。'

export function authConsentError(accepted: boolean) {
  return accepted ? '' : AUTH_CONSENT_ERROR
}

export function wechatMiniRuntimeError(isH5: boolean) {
  return isH5 ? WECHAT_MINI_RUNTIME_ERROR : ''
}

export function wechatNotificationRuntimeError(isH5: boolean) {
  return isH5 ? WECHAT_NOTIFICATION_RUNTIME_ERROR : ''
}
