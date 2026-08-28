export const adminJobTypeOptions = [
  { value: 'account.bind.qr', label: '扫码绑定' },
  { value: 'account.bind.sms', label: '短信绑定' },
  { value: 'account.relogin.qr', label: '扫码重新登录' },
  { value: 'account.relogin.sms', label: '短信重新登录' },
  { value: 'account.session_check.browser', label: '登录态检查' },
  { value: 'account.friends_sync.browser', label: '会话同步（兼容）' },
  { value: 'conversation.archive.browser', label: '平台会话归档' },
  { value: 'send.dispatch', label: '发送调度' },
  { value: 'send.browser', label: 'Browser 发送' },
  { value: 'send.protocol', label: 'Protocol 发送' },
  { value: 'capability.probe', label: 'Adapter 探针' },
  { value: 'notification.wechat.send', label: '微信通知' },
] as const

const adminJobTypeLabels = new Map<string, string>(adminJobTypeOptions.map((item) => [item.value, item.label]))

export function adminJobTypeLabel(type: string) {
  return adminJobTypeLabels.get(type) ?? type
}
