export type NotificationPriority = 'info' | 'warning' | 'critical'

export function notificationPriorityLabel(priority: NotificationPriority) {
  if (priority === 'critical') return '严重'
  if (priority === 'warning') return '注意'
  return '提示'
}

export function notificationReadLabel(readAt: string | null) {
  return readAt ? '已读' : '未读'
}

const notificationCodeLabels: Record<string, string> = {
  ADAPTER_UNAVAILABLE: '发送通道暂不可用',
  ADAPTER_INCOMPATIBLE: '发送通道不兼容',
  BROWSER_SELECTOR_CHANGED: '平台页面结构发生变化',
  CHALLENGE_REQUIRED: '需要完成安全验证',
  NETWORK_TIMEOUT: '网络连接超时',
  PLATFORM_RATE_LIMITED: '平台操作频率受限',
  SESSION_EXPIRED: '账号登录状态已过期',
  TARGET_IDENTITY_MISMATCH: '会话身份尚未确认',
  UNSUPPORTED_PROTOCOL_VERSION: '协议版本暂不支持',
}

export function notificationBodyLabel(body: string) {
  return Object.entries(notificationCodeLabels).reduce((current, [code, label]) => current.split(code).join(label), body)
}
