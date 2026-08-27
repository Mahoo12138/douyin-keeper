import { describe, expect, it } from 'vitest'

import { effectiveCapabilities } from './capability-utils'

describe('effective account capabilities', () => {
  it('collapses adapter snapshots and prefers an available adapter', () => {
    const result = effectiveCapabilities([
      { capability: 'message.send.text.existing', status: 'available', checked_at: '2026-08-28T02:00:00Z' },
      { capability: 'message.send.text.existing', status: 'unavailable', checked_at: '2026-08-28T03:00:00Z' },
      { capability: 'message.send.text.first', status: 'unavailable', checked_at: '2026-08-28T02:00:00Z' },
      { capability: 'message.send.text.first', status: 'degraded', checked_at: '2026-08-28T01:00:00Z' },
    ])

    expect(result).toEqual([
      { capability: 'message.send.text.existing', status: 'available', checked_at: '2026-08-28T02:00:00Z' },
      { capability: 'message.send.text.first', status: 'degraded', checked_at: '2026-08-28T01:00:00Z' },
    ])
  })
})
