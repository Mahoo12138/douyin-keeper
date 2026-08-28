import Taro from '@tarojs/taro'

const ACCESS_TOKEN_KEY = 'douyin-keeper-mini-access-token'
const REFRESH_TOKEN_KEY = 'douyin-keeper-mini-refresh-token'
const PENDING_BINDING_KEY = 'douyin-keeper-mini-pending-binding'

export type MiniAuthSession = {
  access_token: string
  refresh_token?: string | null
}

export type PendingBinding = {
  job_id: string
  method: 'qr' | 'sms'
  account_id?: string
}

export function getAccessToken() {
  const value = Taro.getStorageSync(ACCESS_TOKEN_KEY)
  return typeof value === 'string' && value ? value : null
}

export function setAccessToken(token: string) {
  Taro.setStorageSync(ACCESS_TOKEN_KEY, token)
}

export function getRefreshToken() {
  const value = Taro.getStorageSync(REFRESH_TOKEN_KEY)
  return typeof value === 'string' && value ? value : null
}

export function setSession(session: MiniAuthSession) {
  setAccessToken(session.access_token)
  if (session.refresh_token) {
    Taro.setStorageSync(REFRESH_TOKEN_KEY, session.refresh_token)
  } else {
    Taro.removeStorageSync(REFRESH_TOKEN_KEY)
  }
}

export function getPendingBinding(): PendingBinding | null {
  const value = Taro.getStorageSync(PENDING_BINDING_KEY)
  if (!value || typeof value !== 'object') return null
  const candidate = value as Record<string, unknown>
  if (typeof candidate.job_id !== 'string' || !candidate.job_id) return null
  if (candidate.method !== 'qr' && candidate.method !== 'sms') return null
  return {
    job_id: candidate.job_id,
    method: candidate.method,
    ...(typeof candidate.account_id === 'string' && candidate.account_id ? { account_id: candidate.account_id } : {}),
  }
}

export function setPendingBinding(binding: PendingBinding) {
  Taro.setStorageSync(PENDING_BINDING_KEY, binding)
}

export function clearPendingBinding() {
  Taro.removeStorageSync(PENDING_BINDING_KEY)
}

export function clearSession() {
  Taro.removeStorageSync(ACCESS_TOKEN_KEY)
  Taro.removeStorageSync(REFRESH_TOKEN_KEY)
  clearPendingBinding()
}

export function clearAccessToken() {
  clearSession()
}
