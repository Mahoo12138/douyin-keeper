import { createFileRoute } from '@tanstack/react-router'
import { MessageTemplatesPage } from '@/features/templates/message-templates-page'

export const Route = createFileRoute('/(root)/templates')({
  component: MessageTemplatesPage,
})
