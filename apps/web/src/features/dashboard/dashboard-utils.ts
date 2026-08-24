import type { components } from '@douyin-keeper/sdk-ts'

export type Account = components['schemas']['Account']
export type SendIntent = components['schemas']['SendIntent']
export type SparkTask = components['schemas']['SparkTask']

const PENDING_STATUSES = new Set<SendIntent['status']>(['pending', 'queued', 'running', 'retry_wait'])

export function summarizeAccounts(accounts: Account[]) {
  return {
    bound: accounts.filter((account) => account.binding_status === 'bound').length,
    valid: accounts.filter((account) => account.binding_status === 'bound' && account.session_status === 'valid').length,
    expired: accounts.filter((account) => account.session_status === 'expired').length,
    paused: accounts.filter((account) => account.risk_status === 'paused').length,
  }
}

export function summarizeIntents(intents: SendIntent[], now = new Date()) {
  const pending = intents.filter((intent) => PENDING_STATUSES.has(intent.status)).length
  const succeeded = intents.filter((intent) => intent.status === 'succeeded').length
  const failed = intents.filter((intent) => intent.status === 'failed').length
  const next = intents
    .filter((intent) => PENDING_STATUSES.has(intent.status) && new Date(intent.scheduled_at).getTime() >= now.getTime())
    .sort((left, right) => new Date(left.scheduled_at).getTime() - new Date(right.scheduled_at).getTime())[0]
  return { pending, succeeded, failed, next }
}

export function countTasksByAccount(tasks: SparkTask[]) {
  const counts = new Map<string, number>()
  for (const task of tasks) counts.set(task.account_id, (counts.get(task.account_id) ?? 0) + (task.enabled ? 1 : 0))
  return counts
}

export function countIntentsByAccount(intents: SendIntent[]) {
  const counts = new Map<string, { pending: number; succeeded: number; failed: number; next?: SendIntent }>()
  for (const intent of intents) {
    const current = counts.get(intent.account_id) ?? { pending: 0, succeeded: 0, failed: 0 }
    if (PENDING_STATUSES.has(intent.status)) current.pending += 1
    if (intent.status === 'succeeded') current.succeeded += 1
    if (intent.status === 'failed') current.failed += 1
    if (PENDING_STATUSES.has(intent.status) && (!current.next || new Date(intent.scheduled_at).getTime() < new Date(current.next.scheduled_at).getTime())) {
      current.next = intent
    }
    counts.set(intent.account_id, current)
  }
  return counts
}

export function todayRange(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  const day = `${values.year}-${values.month}-${values.day}`
  const start = new Date(`${day}T00:00:00+08:00`)
  return { day, from: start.toISOString(), to: new Date(start.getTime() + 24 * 60 * 60 * 1000).toISOString() }
}
