import type { components } from '@douyin-keeper/sdk-ts'

export type HistoryItem = components['schemas']['SendIntent']
export type HistoryStatus = HistoryItem['status']
export type HistoryFilter = 'all' | 'active' | 'succeeded' | 'failed' | 'skipped'

export const statusMeta: Record<HistoryStatus, { label: string; tone: 'success' | 'warning' | 'danger' | 'muted' }> = {
  pending: { label: '待处理', tone: 'warning' },
  queued: { label: '排队中', tone: 'warning' },
  running: { label: '执行中', tone: 'warning' },
  retry_wait: { label: '等待重试', tone: 'warning' },
  succeeded: { label: '已成功', tone: 'success' },
  failed: { label: '失败', tone: 'danger' },
  skipped: { label: '已跳过', tone: 'muted' },
  cancelled: { label: '已取消', tone: 'muted' },
}

const filterStatuses: Record<HistoryFilter, HistoryStatus[] | null> = {
  all: null,
  active: ['pending', 'queued', 'running', 'retry_wait'],
  succeeded: ['succeeded'],
  failed: ['failed'],
  skipped: ['skipped', 'cancelled'],
}

export function filterHistory(items: HistoryItem[], filter: HistoryFilter) {
  const statuses = filterStatuses[filter]
  return statuses ? items.filter((item) => statuses.includes(item.status)) : items
}

export function taskLabel(item: HistoryItem) {
  if (item.task?.body) return item.task.body
  if (item.task?.message_kind === 'sticker') return '贴纸消息'
  return item.task_id ? `任务 ${item.task_id.slice(0, 8)}` : '临时发送'
}

export function dayKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function localDayRange(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  const start = new Date(year, month - 1, day)
  const end = new Date(year, month - 1, day + 1)
  return { from: start.toISOString(), to: end.toISOString() }
}

export function recentDays(today = new Date(), count = 7) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - index)
    return dayKey(date)
  })
}
