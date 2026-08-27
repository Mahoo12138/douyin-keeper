export type AccountOption = { id: string }

export function selectAccountId(accounts: readonly AccountOption[], preferredId = '') {
  if (preferredId && accounts.some((account) => account.id === preferredId)) return preferredId
  return accounts[0]?.id ?? ''
}

export function nextEnabledTask<T extends { account_id: string; enabled: boolean }>(tasks: readonly T[], accountId: string) {
  return tasks.find((task) => task.account_id === accountId && task.enabled)
}

export type HomeStatus = { label: string; tone: 'green' | 'amber' }

export function homeAccountStatus(account?: { binding_status: string; session_status: string; risk_status: string } | null): HomeStatus {
  if (!account) return { label: '未绑定', tone: 'amber' }
  if (account.binding_status !== 'bound') return { label: account.binding_status === 'binding' ? '绑定中' : '未绑定', tone: 'amber' }
  if (account.risk_status === 'paused') return { label: '已暂停', tone: 'amber' }
  if (account.session_status !== 'valid') {
    const label = account.session_status === 'expired' ? '已过期' : account.session_status === 'challenge_required' ? '需验证' : '待检查'
    return { label, tone: 'amber' }
  }
  return { label: '正常', tone: 'green' }
}

export function homeTaskStatus(statuses: readonly string[]): HomeStatus {
  if (statuses.some((status) => ['failed', 'skipped', 'cancelled'].includes(status))) return { label: '有异常', tone: 'amber' }
  if (statuses.some((status) => status === 'running')) return { label: '执行中', tone: 'green' }
  return { label: '就绪', tone: 'green' }
}

export function homeOverallStatus(account: HomeStatus, tasks: HomeStatus, dataAvailable: boolean): HomeStatus {
  return account.tone === 'green' && tasks.tone === 'green' && dataAvailable
    ? { label: '全部正常', tone: 'green' }
    : { label: '需要关注', tone: 'amber' }
}

export function createIdempotencyKey() {
  const segment = () => Math.floor(Math.random() * 0x100000000).toString(16).padStart(8, '0')
  const first = segment()
  const second = segment()
  const third = segment()
  const fourth = segment()
  return `${first}-${second.slice(0, 4)}-4${third.slice(1, 4)}-${['8', '9', 'a', 'b'][Math.floor(Math.random() * 4)]}${fourth.slice(1, 4)}-${segment()}${segment().slice(0, 4)}`
}
