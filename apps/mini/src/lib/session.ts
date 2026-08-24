import Taro from '@tarojs/taro'

const ACCESS_TOKEN_KEY = 'douyin-keeper-mini-access-token'

export function getAccessToken() {
  const value = Taro.getStorageSync(ACCESS_TOKEN_KEY)
  return typeof value === 'string' && value ? value : null
}

export function setAccessToken(token: string) {
  Taro.setStorageSync(ACCESS_TOKEN_KEY, token)
}

export function clearAccessToken() {
  Taro.removeStorageSync(ACCESS_TOKEN_KEY)
}
