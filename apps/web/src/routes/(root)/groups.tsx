import { createFileRoute } from '@tanstack/react-router'
import { ConversationsPage } from '@/features/conversations/conversations-page'

export const Route = createFileRoute('/(root)/groups')({
  component: ConversationsPage,
})
