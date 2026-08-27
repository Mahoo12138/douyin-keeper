export function accountBindingError(code: string, fallback = '创建绑定任务失败，请稍后重试。') {
  switch (code) {
    case 'ACCOUNT_QUOTA_EXCEEDED':
      return '账号数量已达当前权益上限，请升级配额后再试。'
    case 'ENTITLEMENT_REQUIRED':
    case 'ENTITLEMENT_EXPIRED':
    case 'FEATURE_NOT_ENTITLED':
      return '当前权益暂不支持添加账号，请先升级或续期。'
    default:
      return fallback
  }
}
