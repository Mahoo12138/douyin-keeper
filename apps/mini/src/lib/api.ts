import Taro from '@tarojs/taro'
import type { components } from '@douyin-keeper/sdk-ts'

import { clearSession, getRefreshToken, setSession } from './session'

const API_BASE_URL = ((process.env.TARO_ENV === 'h5' ? process.env.TARO_APP_H5_API_BASE_URL : process.env.TARO_APP_API_BASE_URL) || '/api/v1').replace(/\/$/, '')

type Collection<T> = { items: T[]; next_cursor?: string | null }
type ApiErrorBody = { error?: { code?: string; message?: string } }
type RequestOptions = { token?: string | null; method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; data?: unknown; headers?: Record<string, string>; skipRefresh?: boolean }

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

export function loginPassword(username: string, password: string) {
  return request<components['schemas']['AuthResponse']>('/auth/mini/login', {
    method: 'POST', data: { username, password }, skipRefresh: true,
  })
}

export function registerPassword(username: string, password: string) {
  return request<components['schemas']['AuthResponse']>('/auth/mini/register', {
    method: 'POST', data: { username, password }, skipRefresh: true,
  })
}

export function logoutMini(token: string) {
  return request<void>('/auth/logout', { method: 'POST', token })
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

export function createAccountBinding(token: string, method: 'qr' | 'sms', options: { phone?: string; accountId?: string; idempotencyKey?: string } = {}) {
  return request<components['schemas']['JobRef']>('/accounts/bindings', {
    method: 'POST', token, headers: options.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : undefined,
    data: { method, ...(options.phone ? { phone: options.phone } : {}), ...(options.accountId ? { account_id: options.accountId } : {}) },
  })
}

export function getJob(token: string, jobId: string) {
  return request<components['schemas']['Job']>(`/jobs/${jobId}`, { token })
}

export type JobEvent = {
  eventType: string
  eventId: number
  payload: Record<string, unknown>
}

export function streamJobEvents(token: string, jobId: string, onEvent: (event: JobEvent) => void) {
  let buffer = ''
  const decoder = new TextDecoder()
  const consumeSSEChunk = (chunk: ArrayBuffer | Uint8Array) => {
    buffer += decoder.decode(chunk, { stream: true })
    const frames = buffer.split(/\r?\n\r?\n/)
    buffer = frames.pop() ?? ''
    frames.forEach((frame) => {
      const eventType = frame.match(/^event:\s*(.+)$/m)?.[1]?.trim()
      const eventId = Number(frame.match(/^id:\s*(\d+)$/m)?.[1] ?? 0)
      const data = frame.match(/^data:\s*(.+)$/m)?.[1]
      if (!eventType || !data) return
      try {
        onEvent({ eventType, eventId, payload: JSON.parse(data) as Record<string, unknown> })
      } catch {
        // Ignore malformed frames; the polling fallback still observes job state.
      }
    })
  }

  if (typeof window !== 'undefined' && typeof fetch === 'function' && typeof AbortController !== 'undefined') {
    const controller = new AbortController()
    void fetch(`${API_BASE_URL}/jobs/${jobId}/events`, {
      method: 'GET',
      headers: { Accept: 'text/event-stream', Authorization: `Bearer ${token}` },
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok || !response.body) return
      const reader = response.body.getReader()
      while (true) {
        const result = await reader.read()
        if (result.done) break
        consumeSSEChunk(result.value)
      }
    }).catch(() => {
      // Polling observes the terminal job state when the stream is unavailable.
    })
    return { abort: () => controller.abort() }
  }

  const task = Taro.request<string>({
    url: `${API_BASE_URL}/jobs/${jobId}/events`,
    method: 'GET',
    dataType: 'text',
    timeout: 305000,
    enableChunked: true,
    header: {
      Accept: 'text/event-stream',
      Authorization: `Bearer ${token}`,
    },
  })
  task.onChunkReceived(({ data }) => consumeSSEChunk(data))
  return { abort: () => task.abort() }
}

export function cancelJob(token: string, jobId: string) {
  return request<void>(`/jobs/${jobId}/cancel`, { method: 'POST', token })
}

export function submitSMSVerification(token: string, jobId: string, code: string) {
  return request<{ status: 'verification_submitted' }>(`/jobs/${jobId}/sms-verify`, {
    method: 'POST', token, data: { code },
  })
}

export function pauseAccount(token: string, accountId: string) {
  return request<void>(`/accounts/${accountId}/pause`, { method: 'POST', token })
}

export function resumeAccount(token: string, accountId: string) {
  return request<void>(`/accounts/${accountId}/resume`, { method: 'POST', token })
}

export function deleteAccount(token: string, accountId: string) {
  return request<void>(`/accounts/${accountId}`, { method: 'DELETE', token })
}

export function syncAccountFriends(token: string, accountId: string, idempotencyKey?: string) {
  // Compatibility name for older mini-program callers. Conversation sync is
  // now the only platform crawl and reads the mixed message-panel inventory.
  return request<components['schemas']['JobRef']>(`/accounts/${accountId}/conversations-sync`, {
    method: 'POST', token, headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
  })
}

export function accountCapabilities(token: string, accountId: string) {
  return request<{ items: components['schemas']['Capability'][] }>(`/accounts/${accountId}/capabilities`, { token })
}

export function listFriends(token: string, accountId: string): Promise<Collection<components['schemas']['Friend']>> {
  // Compatibility projection for the existing spark UI. Its source is the
  // unified conversation endpoint; no follower/friend crawl is performed.
  return (async () => {
    const conversations: components['schemas']['Conversation'][] = []
    let cursor: string | undefined
    do {
      const query = cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''
      const response = await request<Collection<components['schemas']['Conversation']>>(`/accounts/${accountId}/conversations?include_archived=true&group_only=false${query}`, { token })
      conversations.push(...response.items)
      cursor = response.next_cursor ?? undefined
    } while (cursor)

    // The endpoint intentionally returns the mixed conversation inventory
    // when group_only=false. The spark/task surfaces only support direct
    // conversations, so keep group sessions out of the legacy friend shape.
    return {
      items: conversations.filter((item) => item.conversation_type !== 'group').map((item) => ({
        id: item.friend_id ?? item.id,
        platform_identity_status: item.friend_id ? item.platform_identity_status : 'missing',
        display_name: item.friend_display_name,
        nickname: item.friend_nickname || item.friend_display_name,
        short_id: null,
        avatar_url: item.friend_avatar_url,
        streak_days: item.streak_days,
        has_conversation: true,
        spark_enabled: item.spark_enabled,
        last_sent_at: item.last_sent_at,
      })),
      next_cursor: null,
    }
  })()
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

export type CreateTaskInput = {
  account_id: string
  friend_id: string
  enabled: boolean
  timezone: string
  window_start: string
  window_end: string
  message: { kind: 'text' | 'sticker'; body: string }
  allow_first_message?: boolean
}

export function createTask(token: string, input: CreateTaskInput) {
  return request<components['schemas']['SparkTask']>('/tasks', { method: 'POST', token, data: input })
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

export function deleteTask(token: string, taskId: string) {
  return request<void>(`/tasks/${taskId}`, { method: 'DELETE', token })
}

export function runTaskNow(token: string, taskId: string, idempotencyKey: string) {
  return request<{ intent_id: string; job_id: string; status: 'queued' }>(`/tasks/${taskId}/run-now`, {
    method: 'POST', token, headers: { 'Idempotency-Key': idempotencyKey },
  })
}

export function checkAccountSession(token: string, accountId: string, idempotencyKey?: string) {
  return request<components['schemas']['JobRef']>(`/accounts/${accountId}/session-check`, {
    method: 'POST', token, headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
  })
}

export type SendHistoryOptions = { from?: string; to?: string; status?: components['schemas']['SendIntent']['status']; task_id?: string; account_id?: string; friend_id?: string }

export function listSendIntents(token: string, options: SendHistoryOptions = {}) {
  const query = Object.entries(options).filter(([, value]) => value).map(([key, value]) => `${key}=${encodeURIComponent(value!)}`).join('&')
  return request<Collection<components['schemas']['SendIntent']>>(`/send-intents${query ? `?${query}` : ''}`, { token })
}
