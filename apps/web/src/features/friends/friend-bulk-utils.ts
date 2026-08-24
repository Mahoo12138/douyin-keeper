import type { Friend, SparkTask } from './friend-types'

export function toggleSelectedFriend(selected: string[], friendId: string, checked: boolean) {
  const next = new Set(selected)
  if (checked) next.add(friendId)
  else next.delete(friendId)
  return [...next]
}

export function selectAllResolvedFriends(friends: Friend[]) {
  return friends.filter((friend) => friend.platform_identity_status === 'resolved').map((friend) => friend.id)
}

export function tasksForSelectedFriends(tasks: SparkTask[], accountId: string | undefined, friendIds: string[]) {
  const selected = new Set(friendIds)
  return tasks.filter((task) => task.account_id === accountId && selected.has(task.friend_id))
}

export function normalizeTimeInput(value: string) {
  return /^\d{2}:\d{2}$/.test(value) ? `${value}:00` : value
}

export function isValidBulkWindow(start: string, end: string) {
  const normalizedStart = normalizeTimeInput(start)
  const normalizedEnd = normalizeTimeInput(end)
  return /^([01]\d|2[0-3]):[0-5]\d:00$/.test(normalizedStart)
    && /^([01]\d|2[0-3]):[0-5]\d:00$/.test(normalizedEnd)
    && normalizedStart < normalizedEnd
}
