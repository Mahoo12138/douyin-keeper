import { Badge } from '@douyin-keeper/ui-web'

import type { Friend, SparkTask } from './friend-types'

export function identityLabel(status: Friend['platform_identity_status']) {
  return { resolved: '身份已确认', pending: '待确认', ambiguous: '身份有歧义', missing: '缺少身份' }[status]
}

export function taskLabel(task: SparkTask | undefined) {
  if (!task) return '未配置任务'
  return task.enabled ? '任务已启用' : '任务已停用'
}

export function streakBadgePresentation(days: number, activatedToday: boolean | null | undefined) {
  if (days <= 0) return { variant: 'muted' as const, state: 'none' as const, statusLabel: '尚未形成火花' }
  if (activatedToday === true) return { variant: 'success' as const, state: 'activated' as const, statusLabel: '今日已激活' }
  if (activatedToday === false) return { variant: 'muted' as const, state: 'pending' as const, statusLabel: '今日未激活' }
  return { variant: 'warning' as const, state: 'unknown' as const, statusLabel: '今日状态待确认' }
}

export function FriendStatusBadge({ friend }: { friend: Friend }) {
  const variant = friend.platform_identity_status === 'resolved' ? 'success' : friend.platform_identity_status === 'ambiguous' ? 'warning' : 'muted'
  return <Badge variant={variant}>{identityLabel(friend.platform_identity_status)}</Badge>
}

export function TaskStatusBadge({ task }: { task: SparkTask | undefined }) {
  return <Badge variant={task?.enabled ? 'success' : task ? 'warning' : 'muted'}>{taskLabel(task)}</Badge>
}

export function formatFriendDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString('zh-CN') : '—'
}
