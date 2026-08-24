export type NotificationPriority = 'info' | 'warning' | 'critical'

export function notificationPriorityLabel(priority: NotificationPriority) {
  if (priority === 'critical') return '严重'
  if (priority === 'warning') return '注意'
  return '提示'
}

export function notificationReadLabel(readAt: string | null) {
  return readAt ? '已读' : '未读'
}
