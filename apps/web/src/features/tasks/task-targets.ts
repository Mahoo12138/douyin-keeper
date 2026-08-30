import type { Conversation } from '../conversations/conversation-pagination'

export function selectableTaskConversations(conversations: Conversation[], currentConversationId?: string) {
  const seenTargetKeys = new Set<string>()
  return conversations.filter((conversation) => {
    const targetKey = conversation.friend_id ?? conversation.id
    if (seenTargetKeys.has(targetKey)) return false
    const selectable = conversation.id === currentConversationId
      || (
        conversation.spark_supported
        && conversation.spark_enabled
        && !conversation.archived
      )
    if (!selectable) return false
    seenTargetKeys.add(targetKey)
    return true
  })
}

export function taskConversationOptions(conversations: Conversation[]) {
  const counts = new Map<string, number>()
  conversations.forEach((conversation) => {
    const label = conversation.friend_nickname || conversation.friend_display_name || '未命名会话'
    counts.set(label, (counts.get(label) ?? 0) + 1)
  })
  const indexes = new Map<string, number>()
  return conversations.map((conversation) => {
    const label = conversation.friend_nickname || conversation.friend_display_name || '未命名会话'
    const index = (indexes.get(label) ?? 0) + 1
    indexes.set(label, index)
    return {
      value: conversation.id,
      label: (counts.get(label) ?? 0) > 1 ? `${label} · 会话 ${index}` : label,
    }
  })
}
