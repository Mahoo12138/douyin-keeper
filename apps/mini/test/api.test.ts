import { beforeEach, describe, expect, it, vi } from 'vitest'

const storage = vi.hoisted(() => new Map<string, unknown>())
const requestMock = vi.hoisted(() => vi.fn())

vi.mock('@tarojs/taro', () => ({
  default: {
    request: requestMock,
    getStorageSync: (key: string) => storage.get(key),
    setStorageSync: (key: string, value: unknown) => storage.set(key, value),
    removeStorageSync: (key: string) => storage.delete(key),
  },
}))

import { getMe, myEntitlement, redeemCardCode } from '../src/lib/api'
import { getAccessToken, getRefreshToken, setSession } from '../src/lib/session'

describe('mini API auth recovery', () => {
  beforeEach(() => {
    storage.clear()
    requestMock.mockReset()
    setSession({ access_token: 'expired-access', refresh_token: 'refresh-1' })
  })

  it('rotates the mini refresh token and retries a request once after 401', async () => {
    requestMock
      .mockResolvedValueOnce({ statusCode: 401, data: { error: { code: 'UNAUTHENTICATED' } } })
      .mockResolvedValueOnce({ statusCode: 200, data: { access_token: 'access-2', refresh_token: 'refresh-2' } })
      .mockResolvedValueOnce({ statusCode: 200, data: { id: 'user-1', display_name: '用户', role: 'user' } })

    const user = await getMe('expired-access')

    expect(user.display_name).toBe('用户')
    expect(getAccessToken()).toBe('access-2')
    expect(getRefreshToken()).toBe('refresh-2')
    expect(requestMock).toHaveBeenCalledTimes(3)
    expect(requestMock.mock.calls[1]?.[0]?.url).toBe('/api/v1/auth/refresh')
    expect(requestMock.mock.calls[1]?.[0]?.data).toEqual({ refresh_token: 'refresh-1' })
    expect(requestMock.mock.calls[2]?.[0]?.header.Authorization).toBe('Bearer access-2')
  })

  it('clears both tokens when refresh recovery fails', async () => {
    requestMock
      .mockResolvedValueOnce({ statusCode: 401, data: { error: { code: 'UNAUTHENTICATED' } } })
      .mockResolvedValueOnce({ statusCode: 401, data: { error: { code: 'UNAUTHENTICATED' } } })

    await expect(getMe('expired-access')).rejects.toMatchObject({ code: 'UNAUTHENTICATED', statusCode: 401 })
    expect(getAccessToken()).toBeNull()
    expect(getRefreshToken()).toBeNull()
  })

  it('loads entitlement and submits a redeem code through the shared API client', async () => {
    requestMock
      .mockResolvedValueOnce({ statusCode: 200, data: { active: true, plan_code: 'standard' } })
      .mockResolvedValueOnce({ statusCode: 200, data: { entitlement: { active: true, plan_code: 'standard' }, grant: { id: 'grant-1' } } })

    const entitlement = await myEntitlement('access-1')
    const result = await redeemCardCode('access-1', 'DK1-ABCD')

    expect(entitlement.plan_code).toBe('standard')
    expect(result.entitlement.active).toBe(true)
    expect(requestMock.mock.calls[0]?.[0]?.url).toBe('/api/v1/me/entitlement')
    expect(requestMock.mock.calls[1]?.[0]?.url).toBe('/api/v1/entitlements/redeem')
    expect(requestMock.mock.calls[1]?.[0]?.data).toEqual({ code: 'DK1-ABCD' })
  })
})
