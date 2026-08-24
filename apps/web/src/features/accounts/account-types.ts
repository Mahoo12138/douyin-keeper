import type { components } from '@douyin-keeper/sdk-ts'

export type Account = components['schemas']['Account']
export type Capability = components['schemas']['Capability']

export type BindingState = {
  status: 'queued' | 'running' | 'waiting_user' | 'scanned' | 'confirming' | 'error'
  jobId: string | null
  qr: string | null
  expiresAt: string | null
}
