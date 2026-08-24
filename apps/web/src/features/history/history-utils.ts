import { listFriends, type components } from '@douyin-keeper/sdk-ts'

type HistoryFriend = Pick<components['schemas']['Friend'], 'id' | 'nickname' | 'display_name'>

export async function listAllFriendsForAccount(accessToken: string, accountId: string, loadPage: typeof listFriends = listFriends) {
  const friends: HistoryFriend[] = []
  const seenCursors = new Set<string>()
  let cursor: string | undefined

  while (true) {
    const page = await loadPage(accessToken, accountId, { limit: 100, cursor })
    friends.push(...page.items)
    if (!page.next_cursor || seenCursors.has(page.next_cursor)) break
    seenCursors.add(page.next_cursor)
    cursor = page.next_cursor
  }

  return friends
}

export function friendOptionsFromFriends(friends: HistoryFriend[]) {
  const options = new Map<string, string>()
  friends.forEach((friend) => options.set(friend.id, friend.nickname || friend.display_name))
  return [...options.entries()].sort((left, right) => left[1].localeCompare(right[1], 'zh-CN'))
}
