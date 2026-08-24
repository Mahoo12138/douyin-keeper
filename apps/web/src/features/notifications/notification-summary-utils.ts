export function notificationUnreadLabel(count: number | null | undefined) {
  if (!count || count < 1) return undefined
  return count > 99 ? '99+' : String(count)
}
