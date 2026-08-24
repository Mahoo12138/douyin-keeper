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

import { checkAccountSession, getMe, listMyEntitlementGrants, listNotifications, markAllNotificationsRead, markNotificationRead, myEntitlement, redeemCardCode, runTaskNow, updateTask } from '../src/lib/api'
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

  it('loads paginated entitlement redemption history', async () => {
    requestMock.mockResolvedValueOnce({ statusCode: 200, data: { items: [{ id: 'grant-1' }], next_cursor: 'cursor-2' } })

    const result = await listMyEntitlementGrants('access-1', { limit: 10, cursor: 'cursor-1' })

    expect(result.next_cursor).toBe('cursor-2')
    expect(requestMock.mock.calls[0]?.[0]?.url).toBe('/api/v1/entitlements/redemptions?limit=10&cursor=cursor-1')
  })

  it('loads notifications and supports marking one or all as read', async () => {
    requestMock
      .mockResolvedValueOnce({ statusCode: 200, data: { items: [], unread_count: 2, next_cursor: null } })
      .mockResolvedValueOnce({ statusCode: 204, data: undefined })
      .mockResolvedValueOnce({ statusCode: 200, data: { marked_count: 2 } })

    const notifications = await listNotifications('access-1', { limit: 3 })
    await markNotificationRead('access-1', 'notification-1')
    const result = await markAllNotificationsRead('access-1')

    expect(notifications.unread_count).toBe(2)
    expect(requestMock.mock.calls[0]?.[0]?.url).toBe('/api/v1/notifications?limit=3')
    expect(requestMock.mock.calls[1]?.[0]?.url).toBe('/api/v1/notifications/notification-1/read')
    expect(requestMock.mock.calls[2]?.[0]?.url).toBe('/api/v1/notifications/read-all')
    expect(result.marked_count).toBe(2)
  })

  it('patches task settings without changing the shared auth client contract', async () => {
    requestMock.mockResolvedValueOnce({ statusCode: 200, data: { id: 'task-1', enabled: true } })

    const task = await updateTask('access-1', 'task-1', {
      window_start: '19:30:00',
      window_end: '22:30:00',
      message: { kind: 'text', body: '晚间问候' },
    })

    expect(task.id).toBe('task-1')
    expect(requestMock.mock.calls[0]?.[0]?.url).toBe('/api/v1/tasks/task-1')
    expect(requestMock.mock.calls[0]?.[0]?.method).toBe('PATCH')
    expect(requestMock.mock.calls[0]?.[0]?.data).toEqual({
      window_start: '19:30:00',
      window_end: '22:30:00',
      message: { kind: 'text', body: '晚间问候' },
    })
  })

  it('sends the idempotency key for immediate task execution', async () => {
    requestMock.mockResolvedValueOnce({ statusCode: 202, data: { intent_id: 'intent-1', job_id: 'job-1', status: 'queued' } })

    const result = await runTaskNow('access-1', 'task-1', '00000000-0000-4000-8000-000000000001')

    expect(result.status).toBe('queued')
    expect(requestMock.mock.calls[0]?.[0]?.url).toBe('/api/v1/tasks/task-1/run-now')
    expect(requestMock.mock.calls[0]?.[0]?.method).toBe('POST')
    expect(requestMock.mock.calls[0]?.[0]?.header['Idempotency-Key']).toBe('00000000-0000-4000-8000-000000000001')
  })

  it('submits an account session check job', async () => {
    requestMock.mockResolvedValueOnce({ statusCode: 202, data: { job_id: 'job-1' } })

    const result = await checkAccountSession('access-1', 'account-1')

    expect(result.job_id).toBe('job-1')
    expect(requestMock.mock.calls[0]?.[0]?.url).toBe('/api/v1/accounts/account-1/session-check')
    expect(requestMock.mock.calls[0]?.[0]?.method).toBe('POST')
  })
})
