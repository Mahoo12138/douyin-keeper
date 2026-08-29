import type { Friend } from './task-types'

export function selectableTaskConversations(conversations: Friend[], currentConversationId?: string) {
  // A peer may have multiple platform conversation rows,
  // but the task contract targets one stable friend projection.
  const seenFriendIds = new Set<string>()
  return conversations.filter((conversation) => {
    if (seenFriendIds.has(conversation.id)) return false
    const selectable = conversation.id === currentConversationId
      || (
        conversation.has_conversation
        && conversation.spark_enabled
        && conversation.platform_identity_status === 'resolved'
      )
    if (!selectable) return false
    seenFriendIds.add(conversation.id)
    return true
  })
}
