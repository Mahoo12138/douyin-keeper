import { describe, expect, it } from 'vitest'

import { redeemErrorMessage } from './entitlement-error-utils'

describe('entitlement redemption errors', () => {
  it('explains an invalid card without exposing the API message', () => {
    expect(redeemErrorMessage('CONFLICT', 'invalid card code')).toBe('卡密无效或不存在，请检查后重试。')
  })

  it('explains an already redeemed card', () => {
    expect(redeemErrorMessage('CODE_ALREADY_REDEEMED', 'card code already redeemed')).toBe('该卡密已被兑换，请更换其他卡密。')
  })

  it('uses a localized fallback for unknown errors', () => {
    expect(redeemErrorMessage('UNKNOWN', 'unexpected backend detail')).toBe('卡密兑换失败，请稍后重试。')
  })
})
