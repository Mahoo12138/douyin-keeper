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

import { accountCapabilities, cancelJob, checkAccountSession, createAccountBinding, createTask, deleteAccount, getJob, getMe, listFriends, listMyEntitlementGrants, listNotifications, loginPassword, markAllNotificationsRead, markNotificationRead, myEntitlement, pauseAccount, redeemCardCode, registerPassword, resumeAccount, runTaskNow, streamJobEvents, submitSMSVerification, syncAccountFriends, updateTask } from '../src/lib/api'
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

  it('logs a mini client in with local account credentials', async () => {
    requestMock.mockResolvedValueOnce({
      statusCode: 200,
      data: {
        access_token: 'access-mini',
        refresh_token: 'refresh-mini',
        user: { id: 'user-1', display_name: '用户' },
      },
    })

    const session = await loginPassword('User-1', 'password123')

    expect(session.refresh_token).toBe('refresh-mini')
    expect(requestMock.mock.calls[0]?.[0]).toMatchObject({
      url: '/api/v1/auth/mini/login',
      method: 'POST',
      data: { username: 'User-1', password: 'password123' },
    })
  })

  it('registers a mini client with local account credentials', async () => {
    requestMock.mockResolvedValueOnce({
      statusCode: 201,
      data: {
        access_token: 'access-new',
        refresh_token: 'refresh-new',
        user: { id: 'user-new', display_name: 'new-user' },
      },
    })

    const session = await registerPassword('new-user', 'password123')

    expect(session.access_token).toBe('access-new')
    expect(requestMock.mock.calls[0]?.[0]).toMatchObject({
      url: '/api/v1/auth/mini/register',
      method: 'POST',
      data: { username: 'new-user', password: 'password123' },
    })
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

  it('projects group conversations into the spark page friend shape', async () => {
    requestMock.mockResolvedValueOnce({
      statusCode: 200,
      data: {
        items: [{
          id: 'conversation-1',
          friend_id: null,
          friend_display_name: '项目群',
          friend_nickname: '',
          friend_avatar_url: null,
          streak_days: 0,
          spark_enabled: true,
          last_sent_at: null,
          platform_identity_status: 'missing',
        }],
        next_cursor: null,
      },
    })

    const result = await listFriends('access-1', 'account-1')

    expect(result.items[0]).toMatchObject({
      id: 'conversation-1',
      display_name: '项目群',
      nickname: '项目群',
      platform_identity_status: 'missing',
      has_conversation: true,
    })
    expect(requestMock.mock.calls[0]?.[0]?.url).toBe('/api/v1/accounts/account-1/conversations?include_archived=true&group_only=false')
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

  it('creates a task with the selected account and friend payload', async () => {
    requestMock.mockResolvedValueOnce({ statusCode: 201, data: { id: 'task-1', account_id: 'account-1', friend_id: 'friend-1', enabled: true } })

    const task = await createTask('access-1', {
      account_id: 'account-1',
      friend_id: 'friend-1',
      enabled: true,
      timezone: 'Asia/Shanghai',
      window_start: '19:30:00',
      window_end: '22:30:00',
      message: { kind: 'text', body: '晚间问候' },
      allow_first_message: false,
    })

    expect(task.id).toBe('task-1')
    expect(requestMock.mock.calls[0]?.[0]).toMatchObject({
      url: '/api/v1/tasks',
      method: 'POST',
      data: {
        account_id: 'account-1',
        friend_id: 'friend-1',
        enabled: true,
        timezone: 'Asia/Shanghai',
        window_start: '19:30:00',
        window_end: '22:30:00',
        message: { kind: 'text', body: '晚间问候' },
        allow_first_message: false,
      },
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

  it('uses the account operations from the frozen backend contract', async () => {
    requestMock
      .mockResolvedValueOnce({ statusCode: 202, data: { job_id: 'job-bind' } })
      .mockResolvedValueOnce({ statusCode: 200, data: { id: 'job-bind', status: 'waiting_user', type: 'account.bind.qr' } })
      .mockResolvedValueOnce({ statusCode: 202, data: undefined })
      .mockResolvedValueOnce({ statusCode: 202, data: { job_id: 'job-sync' } })
      .mockResolvedValueOnce({ statusCode: 204, data: undefined })
      .mockResolvedValueOnce({ statusCode: 204, data: undefined })
      .mockResolvedValueOnce({ statusCode: 204, data: undefined })
      .mockResolvedValueOnce({ statusCode: 200, data: { items: [{ capability: 'send_text', status: 'available', checked_at: '2026-08-26T00:00:00Z' }] } })

    await createAccountBinding('access-1', 'qr')
    await getJob('access-1', 'job-bind')
    await cancelJob('access-1', 'job-bind')
    await syncAccountFriends('access-1', 'account-1')
    await pauseAccount('access-1', 'account-1')
    await resumeAccount('access-1', 'account-1')
    await deleteAccount('access-1', 'account-1')
    const capabilities = await accountCapabilities('access-1', 'account-1')

    expect(capabilities.items[0]?.status).toBe('available')
    expect(requestMock.mock.calls.map((call) => [call[0]?.url, call[0]?.method])).toEqual([
      ['/api/v1/accounts/bindings', 'POST'],
      ['/api/v1/jobs/job-bind', 'GET'],
      ['/api/v1/jobs/job-bind/cancel', 'POST'],
      ['/api/v1/accounts/account-1/conversations-sync', 'POST'],
      ['/api/v1/accounts/account-1/pause', 'POST'],
      ['/api/v1/accounts/account-1/resume', 'POST'],
      ['/api/v1/accounts/account-1', 'DELETE'],
      ['/api/v1/accounts/account-1/capabilities', 'GET'],
    ])
  })

  it('streams account binding events and submits SMS verification', async () => {
    const chunks: Array<(result: { data: ArrayBuffer }) => void> = []
    const abort = vi.fn()
    requestMock.mockReturnValueOnce({
      onChunkReceived: (callback: (result: { data: ArrayBuffer }) => void) => chunks.push(callback),
      abort,
    })
    const events: Array<{ eventType: string; eventId: number; payload: Record<string, unknown> }> = []
    const stream = streamJobEvents('access-1', 'job-qr', (event) => events.push(event))
    const frame = 'event: qr_ready\nid: 7\ndata: {"format":"data_url","value":"data:image/png;base64,abc"}\n\n'
    chunks[0]?.({ data: new TextEncoder().encode(frame).buffer })
    stream.abort()

    expect(events).toEqual([{ eventType: 'qr_ready', eventId: 7, payload: { format: 'data_url', value: 'data:image/png;base64,abc' } }])
    expect(abort).toHaveBeenCalledTimes(1)
    expect(requestMock.mock.calls[0]?.[0]).toMatchObject({
      url: '/api/v1/jobs/job-qr/events',
      enableChunked: true,
      header: { Accept: 'text/event-stream', Authorization: 'Bearer access-1' },
    })

    requestMock.mockResolvedValueOnce({ statusCode: 202, data: { status: 'verification_submitted' } })
    await submitSMSVerification('access-1', 'job-sms', '123456')
    expect(requestMock.mock.calls[1]?.[0]).toMatchObject({
      url: '/api/v1/jobs/job-sms/sms-verify',
      method: 'POST',
      data: { code: '123456' },
    })
  })
})
