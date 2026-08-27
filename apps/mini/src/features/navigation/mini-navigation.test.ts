import { beforeEach, describe, expect, it, vi } from 'vitest'

const storage = vi.hoisted(() => new Map<string, unknown>())
const switchTab = vi.hoisted(() => vi.fn())

vi.mock('@tarojs/taro', () => ({
  default: {
    getStorageSync: (key: string) => storage.get(key),
    setStorageSync: (key: string, value: unknown) => storage.set(key, value),
    removeStorageSync: (key: string) => storage.delete(key),
    switchTab,
  },
}))

import { consumeMeScreenTarget, openMeNotifications } from './mini-navigation'

describe('mini notification navigation', () => {
  beforeEach(() => {
    storage.clear()
    switchTab.mockReset()
  })

  it('persists the notification target before switching to the My tab', () => {
    openMeNotifications()

    expect(consumeMeScreenTarget()).toBe('notifications')
    expect(consumeMeScreenTarget()).toBeNull()
    expect(switchTab).toHaveBeenCalledWith({ url: '/pages/login/index' })
  })

  it('ignores unknown pending targets', () => {
    storage.set('douyin-keeper-mini-pending-me-screen', 'settings')

    expect(consumeMeScreenTarget()).toBeNull()
    expect(storage.get('douyin-keeper-mini-pending-me-screen')).toBe('settings')
  })
})
