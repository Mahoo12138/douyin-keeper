import { describe, expect, it } from 'vitest'

import { productDayKey, productDayRange, productHour, recentProductDays } from './time-utils'

describe('product timezone helpers', () => {
  it('uses the Asia/Shanghai calendar day instead of the browser timezone', () => {
    expect(productDayKey(new Date('2026-08-24T16:30:00.000Z'))).toBe('2026-08-25')
  })

  it('builds an exact Asia/Shanghai natural-day range', () => {
    expect(productDayRange('2026-08-25')).toEqual({
      from: '2026-08-24T16:00:00.000Z',
      to: '2026-08-25T16:00:00.000Z',
    })
  })

  it('formats hourly trend buckets in the product timezone', () => {
    expect(productHour('2026-08-24T16:30:00.000Z')).toBe(0)
  })

  it('keeps recent day tabs aligned with the product day', () => {
    expect(recentProductDays(new Date('2026-08-24T16:30:00.000Z'), 3)).toEqual(['2026-08-25', '2026-08-24', '2026-08-23'])
  })
})
