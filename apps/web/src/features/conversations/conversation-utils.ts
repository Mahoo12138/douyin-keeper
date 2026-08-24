export type PlatformArchiveAction = {
  archived: boolean
  label: string
  confirmLabel: string
}

export function getPlatformArchiveAction(localArchived: boolean): PlatformArchiveAction {
  return localArchived
    ? { archived: false, label: '请求平台恢复', confirmLabel: '确定请求平台恢复这个会话吗？' }
    : { archived: true, label: '请求平台归档', confirmLabel: '确定请求平台归档这个会话吗？' }
}
