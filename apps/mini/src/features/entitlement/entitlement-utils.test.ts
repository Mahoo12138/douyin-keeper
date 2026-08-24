import { describe, expect, it } from 'vitest'

import { entitlementStatus, formatEntitlementDate, normalizeRedeemCode, quotaLabel } from './entitlement-utils'

describe('mini entitlement helpers', () => {
  it('labels active and inactive entitlements', () => {
    expect(entitlementStatus(true)).toBe('有效')
    expect(entitlementStatus(false)).toBe('未激活')
  })

  it('formats empty and present expiry dates', () => {
    expect(formatEntitlementDate(null)).toBe('暂无')
    expect(formatEntitlementDate('2026-08-24T12:00:00Z')).toContain('2026')
  })

  it('keeps quota and redeem code display deterministic', () => {
    expect(quotaLabel(2, 5)).toBe('2/5')
    expect(quotaLabel(undefined, undefined)).toBe('0/0')
    expect(normalizeRedeemCode(' dk1-abcd ')).toBe('DK1-ABCD')
  })
})
