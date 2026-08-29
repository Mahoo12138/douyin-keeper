import type { components } from '@douyin-keeper/sdk-ts'

export type Friend = components['schemas']['Friend'] & {
  /** Conversation-row state; absent on the legacy friends endpoint. */
  streak_activated_today?: boolean | null
}
export type SparkTask = components['schemas']['SparkTask']
export type SparkFilter = 'all' | 'enabled' | 'disabled'
export type TaskFilter = 'all' | 'enabled' | 'disabled' | 'none'
