export function entitlementStatus(active: boolean) {
  return active ? '有效' : '未激活'
}

export function formatEntitlementDate(value: string | null | undefined) {
  if (!value) return '暂无'
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

export function quotaLabel(used: number | null | undefined, limit: number | null | undefined) {
  return `${used ?? 0}/${limit ?? 0}`
}

export function normalizeRedeemCode(value: string) {
  return value.trim().toUpperCase()
}
