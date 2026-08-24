import type { Friend, SparkTask, SparkFilter, TaskFilter } from './friend-types'

export function filterFriends(
  friends: Friend[],
  tasks: SparkTask[],
  options: { search: string; sparkFilter: SparkFilter; taskFilter: TaskFilter; accountId: string | undefined },
) {
  const tasksByFriend = new Map(
    tasks.filter((task) => task.account_id === options.accountId).map((task) => [task.friend_id, task]),
  )
  const search = options.search.trim().toLocaleLowerCase('zh-CN')

  return friends.filter((friend) => {
    if (options.sparkFilter === 'enabled' && !friend.spark_enabled) return false
    if (options.sparkFilter === 'disabled' && friend.spark_enabled) return false
    if (options.taskFilter !== 'all') {
      const task = tasksByFriend.get(friend.id)
      if (options.taskFilter === 'none' && task) return false
      if (options.taskFilter === 'enabled' && (!task || !task.enabled)) return false
      if (options.taskFilter === 'disabled' && (!task || task.enabled)) return false
    }
    if (!search) return true
    return [friend.display_name, friend.nickname, friend.short_id ?? '']
      .some((value) => (value ?? '').toLocaleLowerCase('zh-CN').includes(search))
  })
}

export function taskForFriend(tasks: SparkTask[], accountId: string | undefined, friendId: string) {
  return tasks.find((task) => task.account_id === accountId && task.friend_id === friendId)
}
