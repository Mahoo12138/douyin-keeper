import { describe, expect, it } from 'vitest'

import { entitlementGrantStatus, entitlementSourceLabel, entitlementStatus, formatEntitlementDate, normalizeRedeemCode, quotaLabel } from './entitlement-utils'

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

  it('maps grant lifecycle and source labels for the redemption history', () => {
    const now = new Date('2026-08-25T00:00:00Z')
    expect(entitlementGrantStatus({ starts_at: '2026-08-24T00:00:00Z', expires_at: '2026-08-26T00:00:00Z' }, now)).toEqual({ label: '有效', tone: 'success' })
    expect(entitlementGrantStatus({ starts_at: '2026-08-26T00:00:00Z', expires_at: '2026-08-27T00:00:00Z' }, now)).toEqual({ label: '待生效', tone: 'warning' })
    expect(entitlementGrantStatus({ starts_at: '2026-08-20T00:00:00Z', expires_at: '2026-08-24T00:00:00Z' }, now)).toEqual({ label: '已过期', tone: 'muted' })
    expect(entitlementGrantStatus({ starts_at: '2026-08-20T00:00:00Z', expires_at: '2026-08-30T00:00:00Z', revoked_at: '2026-08-23T00:00:00Z' }, now)).toEqual({ label: '已撤销', tone: 'muted' })
    expect(entitlementSourceLabel('card')).toBe('卡密兑换')
    expect(entitlementSourceLabel('admin')).toBe('管理员授权')
  })
})
