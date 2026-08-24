import Taro from '@tarojs/taro'

const ACCESS_TOKEN_KEY = 'douyin-keeper-mini-access-token'
const REFRESH_TOKEN_KEY = 'douyin-keeper-mini-refresh-token'

export type MiniAuthSession = {
  access_token: string
  refresh_token?: string | null
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

export function clearSession() {
  Taro.removeStorageSync(ACCESS_TOKEN_KEY)
  Taro.removeStorageSync(REFRESH_TOKEN_KEY)
}

export function clearAccessToken() {
  clearSession()
}
