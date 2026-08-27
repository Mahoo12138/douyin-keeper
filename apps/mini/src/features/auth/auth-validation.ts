export const AUTH_CONSENT_ERROR = '请先阅读并同意《用户协议》和《隐私政策》。'

export function authConsentError(accepted: boolean) {
  return accepted ? '' : AUTH_CONSENT_ERROR
}
