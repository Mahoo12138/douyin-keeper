import Taro from '@tarojs/taro'

const PENDING_ME_SCREEN_KEY = 'douyin-keeper-mini-pending-me-screen'

export type MeScreenTarget = 'entitlement' | 'notifications'

export function openLoginPage() {
  void Taro.hideTabBar({ animation: false })
  void Taro.switchTab({ url: '/pages/login/index' })
}

export function openMeNotifications() {
  Taro.setStorageSync(PENDING_ME_SCREEN_KEY, 'notifications')
  void Taro.switchTab({ url: '/pages/login/index' })
}

export function openMeEntitlement() {
  Taro.setStorageSync(PENDING_ME_SCREEN_KEY, 'entitlement')
  void Taro.switchTab({ url: '/pages/login/index' })
}

export function consumeMeScreenTarget(): MeScreenTarget | null {
  const target = Taro.getStorageSync(PENDING_ME_SCREEN_KEY)
  if (target !== 'entitlement' && target !== 'notifications') return null
  Taro.removeStorageSync(PENDING_ME_SCREEN_KEY)
  return target
}
