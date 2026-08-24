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

export function entitlementGrantStatus(grant: { starts_at: string; expires_at: string; revoked_at?: string | null }, now = new Date()) {
  if (grant.revoked_at) return { label: '已撤销', tone: 'muted' as const }
  if (now.getTime() < new Date(grant.starts_at).getTime()) return { label: '待生效', tone: 'warning' as const }
  if (now.getTime() >= new Date(grant.expires_at).getTime()) return { label: '已过期', tone: 'muted' as const }
  return { label: '有效', tone: 'success' as const }
}

export function entitlementSourceLabel(sourceType: 'card' | 'admin') {
  return sourceType === 'card' ? '卡密兑换' : '管理员授权'
}
