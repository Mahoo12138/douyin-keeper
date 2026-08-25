import { listFriends, type components } from '@douyin-keeper/sdk-ts'

export type WebFriend = components['schemas']['Friend']

export async function listAllFriendsForAccount(
  accessToken: string,
  accountId: string,
  loadPage: typeof listFriends = listFriends,
) {
  const friends: WebFriend[] = []
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
