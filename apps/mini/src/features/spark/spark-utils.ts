import type { components } from '@douyin-keeper/sdk-ts'

type Friend = components['schemas']['Friend']
type SparkTask = components['schemas']['SparkTask']

export function taskForFriend(tasks: SparkTask[], friendId: string) {
  return tasks.find((task) => task.friend_id === friendId)
}

export function replaceFriend<T extends Friend>(friends: T[], updated: Friend): T[] {
  return friends.map((friend) => friend.id === updated.id ? { ...friend, ...updated } : friend)
}

export function replaceTask(tasks: SparkTask[], updated: SparkTask) {
  return tasks.map((task) => task.id === updated.id ? updated : task)
}

export function enabledTaskCount(tasks: SparkTask[]) {
  return tasks.filter((task) => task.enabled).length
}

export function uniqueSparkTargets<T extends { id: string }>(friends: T[]) {
  const seen = new Set<string>()
  return friends.filter((friend) => {
    if (seen.has(friend.id)) return false
    seen.add(friend.id)
    return true
  })
}

export function taskTargetCandidates<T extends { id: string; archived: boolean; platform_identity_status: string }>(friends: T[]) {
  return uniqueSparkTargets(friends.filter((friend) => !friend.archived && friend.platform_identity_status === 'resolved'))
}

export function taskTimeInput(value: string) {
  return value.slice(0, 5)
}

export function taskTimePayload(value: string) {
  return value.length === 5 ? `${value}:00` : value
}

export function taskDraftError(windowStart: string, windowEnd: string, message: string) {
  if (!windowStart || !windowEnd) return '请选择完整的发送时间窗口。'
  if (windowStart >= windowEnd) return '结束时间必须晚于开始时间。'
  if (!message.trim()) return '请填写消息内容。'
  return null
}

export function taskCreateDraftError(accountId: string, friendId: string, windowStart: string, windowEnd: string, message: string) {
  if (!accountId) return '请选择要使用的抖音账号。'
  if (!friendId) return '请选择已确认会话。'
  return taskDraftError(windowStart, windowEnd, message)
}
