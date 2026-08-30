import type { components } from '@douyin-keeper/sdk-ts'

export type Account = components['schemas']['Account']
export type Friend = components['schemas']['Friend']
export type Task = components['schemas']['SparkTask']
export type MessageTemplate = components['schemas']['MessageTemplate']

export type TaskDraft = {
  id?: string
  accountId: string
  conversationId: string
  enabled: boolean
  timezone: string
  windowStart: string
  windowEnd: string
  messageKind: 'text' | 'sticker'
  message: string
  allowFirstMessage: boolean
}
