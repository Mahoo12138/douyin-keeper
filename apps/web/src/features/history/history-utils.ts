import type { components } from '@douyin-keeper/sdk-ts'

export { listAllConversationsForAccount as listAllFriendsForAccount } from '../conversations/conversation-pagination'

type HistoryFriend = Pick<components['schemas']['Friend'], 'id' | 'nickname' | 'display_name'>

export function friendOptionsFromFriends(friends: HistoryFriend[]) {
  const options = new Map<string, string>()
  friends.forEach((friend) => options.set(friend.id, friend.nickname || friend.display_name))
  return [...options.entries()].sort((left, right) => left[1].localeCompare(right[1], 'zh-CN'))
}
