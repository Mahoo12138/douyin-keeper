import Taro from '@tarojs/taro'
import type { components } from '@douyin-keeper/sdk-ts'

import { clearSession, getRefreshToken, setSession } from './session'

const API_BASE_URL = (process.env.TARO_APP_API_BASE_URL || '/api/v1').replace(/\/$/, '')

type Collection<T> = { items: T[]; next_cursor?: string | null }
type ApiErrorBody = { error?: { code?: string; message?: string } }
type RequestOptions = { token?: string | null; method?: 'GET' | 'POST' | 'PATCH'; data?: unknown; headers?: Record<string, string>; skipRefresh?: boolean }

export class MiniApiError extends Error {
  constructor(public readonly code: string, message: string, public readonly statusCode: number) {
    super(message)
    this.name = 'MiniApiError'
  }
}

async function request<T>(path: string, options: RequestOptions = {}) {
  const response = await Taro.request<T | ApiErrorBody>({
    url: `${API_BASE_URL}${path}`,
    method: options.method ?? 'GET',
    data: options.data,
    header: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...options.headers,
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
  })
  if (response.statusCode === 401 && options.token && !options.skipRefresh) {
    const refreshToken = getRefreshToken()
    if (refreshToken) {
      try {
        const session = await refreshMiniSession(refreshToken)
        setSession(session)
        return request<T>(path, { ...options, token: session.access_token, skipRefresh: true })
      } catch {
        clearSession()
      }
    }
  }
  if (response.statusCode < 200 || response.statusCode >= 300) {
    const body = response.data as ApiErrorBody
    throw new MiniApiError(body.error?.code ?? `HTTP_${response.statusCode}`, body.error?.message ?? '请求失败', response.statusCode)
  }
  return response.data as T
}

export function refreshMiniSession(refreshToken: string) {
  return request<components['schemas']['AuthResponse']>('/auth/refresh', {
    method: 'POST', data: { refresh_token: refreshToken }, skipRefresh: true,
  })
}

export function loginWechatMini(wechatCode: string) {
  return request<components['schemas']['AuthResponse']>('/auth/wechat-mini/login', { method: 'POST', data: { wechat_code: wechatCode } })
}

export function linkWechatMini(wechatCode: string, linkCode: string) {
  return request<components['schemas']['AuthResponse']>('/auth/wechat-mini/link', { method: 'POST', data: { wechat_code: wechatCode, link_code: linkCode } })
}

export function getNotificationPreferences(token: string) {
  return request<components['schemas']['NotificationPreferences']>('/notifications/preferences', { token })
}

export function myEntitlement(token: string) {
  return request<components['schemas']['EffectiveEntitlement']>('/me/entitlement', { token })
}

export function redeemCardCode(token: string, code: string) {
  return request<components['schemas']['RedeemResult']>('/entitlements/redeem', {
    method: 'POST', token, data: { code },
  })
}

export function listMyEntitlementGrants(token: string, options: { limit?: number; cursor?: string } = {}) {
  const query = new URLSearchParams()
  if (options.limit) query.set('limit', String(options.limit))
  if (options.cursor) query.set('cursor', options.cursor)
  const suffix = query.toString() ? `?${query.toString()}` : ''
  return request<Collection<components['schemas']['EntitlementGrant']>>(`/entitlements/redemptions${suffix}`, { token })
}

export function updateNotificationPreferences(token: string, wechatEnabled: boolean) {
  return request<components['schemas']['NotificationPreferences']>('/notifications/preferences', {
    method: 'PATCH', token, data: { wechat_enabled: wechatEnabled },
  })
}

export function listNotifications(token: string, options: { unread_only?: boolean; limit?: number; cursor?: string } = {}) {
  const query = new URLSearchParams()
  if (options.unread_only !== undefined) query.set('unread_only', String(options.unread_only))
  if (options.limit) query.set('limit', String(options.limit))
  if (options.cursor) query.set('cursor', options.cursor)
  const suffix = query.toString() ? `?${query.toString()}` : ''
  return request<components['schemas']['NotificationList']>(`/notifications${suffix}`, { token })
}

export function markNotificationRead(token: string, notificationId: string) {
  return request<void>(`/notifications/${notificationId}/read`, { method: 'POST', token })
}

export function markAllNotificationsRead(token: string) {
  return request<{ marked_count: number }>('/notifications/read-all', { method: 'POST', token })
}

export function getMe(token: string) {
  return request<components['schemas']['User']>('/me', { token })
}

export function listAccounts(token: string) {
  return request<Collection<components['schemas']['Account']>>('/accounts', { token })
}

export function listFriends(token: string, accountId: string) {
  return request<Collection<components['schemas']['Friend']>>(`/accounts/${accountId}/friends`, { token })
}

export function updateFriend(token: string, friendId: string, sparkEnabled: boolean) {
  return request<components['schemas']['Friend']>(`/friends/${friendId}`, {
    method: 'PATCH',
    token,
    data: { spark_enabled: sparkEnabled },
  })
}

export function listTasks(token: string) {
  return request<Collection<components['schemas']['SparkTask']>>('/tasks', { token })
}

export type UpdateTaskPatch = {
  enabled?: boolean
  timezone?: string
  window_start?: string
  window_end?: string
  message?: { kind: 'text' | 'sticker'; body: string }
  allow_first_message?: boolean
}

export function updateTask(token: string, taskId: string, patch: UpdateTaskPatch) {
  return request<components['schemas']['SparkTask']>(`/tasks/${taskId}`, {
    method: 'PATCH',
    token,
    data: patch,
  })
}

export function runTaskNow(token: string, taskId: string, idempotencyKey: string) {
  return request<{ intent_id: string; job_id: string; status: 'queued' }>(`/tasks/${taskId}/run-now`, {
    method: 'POST', token, headers: { 'Idempotency-Key': idempotencyKey },
  })
}

export function checkAccountSession(token: string, accountId: string) {
  return request<components['schemas']['JobRef']>(`/accounts/${accountId}/session-check`, {
    method: 'POST', token,
  })
}

export type SendHistoryOptions = { from?: string; to?: string; status?: components['schemas']['SendIntent']['status'] }

export function listSendIntents(token: string, options: SendHistoryOptions = {}) {
  const query = Object.entries(options).filter(([, value]) => value).map(([key, value]) => `${key}=${encodeURIComponent(value!)}`).join('&')
  return request<Collection<components['schemas']['SendIntent']>>(`/send-intents${query ? `?${query}` : ''}`, { token })
}
