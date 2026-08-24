import { describe, expect, it } from 'vitest'

import { createIdempotencyKey } from './home-utils'

describe('mini home actions', () => {
  it('creates UUID-shaped keys for idempotent manual sends', () => {
    const key = createIdempotencyKey()
    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
})
