import Taro from '@tarojs/taro'
import type { components } from '@douyin-keeper/sdk-ts'

const API_BASE_URL = (process.env.TARO_APP_API_BASE_URL || '/api/v1').replace(/\/$/, '')

type Collection<T> = { items: T[]; next_cursor?: string | null }
type ApiErrorBody = { error?: { code?: string; message?: string } }

export class MiniApiError extends Error {
  constructor(public readonly code: string, message: string, public readonly statusCode: number) {
    super(message)
    this.name = 'MiniApiError'
  }
}

async function request<T>(path: string, options: { token?: string | null; method?: 'GET' | 'POST' | 'PATCH'; data?: unknown } = {}) {
  const response = await Taro.request<T | ApiErrorBody>({
    url: `${API_BASE_URL}${path}`,
    method: options.method ?? 'GET',
    data: options.data,
    header: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
  })
  if (response.statusCode < 200 || response.statusCode >= 300) {
    const body = response.data as ApiErrorBody
    throw new MiniApiError(body.error?.code ?? `HTTP_${response.statusCode}`, body.error?.message ?? '请求失败', response.statusCode)
  }
  return response.data as T
}

export function loginWechatMini(wechatCode: string) {
  return request<components['schemas']['AuthResponse']>('/auth/wechat-mini/login', { method: 'POST', data: { wechat_code: wechatCode } })
}

export function linkWechatMini(wechatCode: string, linkCode: string) {
  return request<components['schemas']['AuthResponse']>('/auth/wechat-mini/link', { method: 'POST', data: { wechat_code: wechatCode, link_code: linkCode } })
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

export function updateTask(token: string, taskId: string, enabled: boolean) {
  return request<components['schemas']['SparkTask']>(`/tasks/${taskId}`, {
    method: 'PATCH',
    token,
    data: { enabled },
  })
}

export type SendHistoryOptions = { from?: string; to?: string; status?: components['schemas']['SendIntent']['status'] }

export function listSendIntents(token: string, options: SendHistoryOptions = {}) {
  const query = Object.entries(options).filter(([, value]) => value).map(([key, value]) => `${key}=${encodeURIComponent(value!)}`).join('&')
  return request<Collection<components['schemas']['SendIntent']>>(`/send-intents${query ? `?${query}` : ''}`, { token })
}
