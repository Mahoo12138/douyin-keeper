import { listConversations, type components } from '@douyin-keeper/sdk-ts'

import type { Friend } from '../friends/friend-types'

export type Conversation = components['schemas']['Conversation']

export async function listAllConversationsForAccount(token: string, accountId: string) {
  const items: Conversation[] = []
  let cursor: string | undefined
  const seen = new Set<string>()
  for (let page = 0; page < 100; page += 1) {
    const response = await listConversations(token, accountId, { limit: 100, cursor, include_archived: true, group_only: false })
    items.push(...response.items)
    if (!response.next_cursor || seen.has(response.next_cursor)) break
    seen.add(response.next_cursor)
    cursor = response.next_cursor
  }
  return items
}

export function conversationToFriend(item: Conversation): Friend {
  return {
    id: item.friend_id ?? item.id,
    platform_identity_status: item.friend_id ? item.platform_identity_status : 'missing',
    display_name: item.friend_display_name,
    nickname: item.friend_nickname,
    short_id: null,
    avatar_url: item.friend_avatar_url,
    streak_days: item.streak_days ?? 0,
    has_conversation: true,
    spark_enabled: item.spark_enabled ?? false,
    last_sent_at: item.last_sent_at ?? null,
  }
}

export function directFriendsFromConversations(items: Conversation[]) {
  return items.map(conversationToFriend)
}
