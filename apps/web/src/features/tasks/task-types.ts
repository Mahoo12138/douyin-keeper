import type { components } from '@douyin-keeper/sdk-ts'

export type Account = components['schemas']['Account']
export type Friend = components['schemas']['Friend']
export type Task = components['schemas']['SparkTask']

export type TaskDraft = {
  id?: string
  accountId: string
  friendId: string
  enabled: boolean
  timezone: string
  windowStart: string
  windowEnd: string
  message: string
  allowFirstMessage: boolean
}
