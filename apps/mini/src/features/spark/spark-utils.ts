import type { components } from '@douyin-keeper/sdk-ts'

type Friend = components['schemas']['Friend']
type SparkTask = components['schemas']['SparkTask']

export function taskForFriend(tasks: SparkTask[], friendId: string) {
  return tasks.find((task) => task.friend_id === friendId)
}

export function replaceFriend(friends: Friend[], updated: Friend) {
  return friends.map((friend) => friend.id === updated.id ? updated : friend)
}

export function replaceTask(tasks: SparkTask[], updated: SparkTask) {
  return tasks.map((task) => task.id === updated.id ? updated : task)
}

export function enabledTaskCount(tasks: SparkTask[]) {
  return tasks.filter((task) => task.enabled).length
}
