import { existsSync, readdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const miniRoot = resolve(__dirname, '..')
const localAssetsRoot = resolve(miniRoot, 'src/assets')
const webAssetsRoot = resolve(miniRoot, '../../apps/web/public/mini-assets')

function listFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(root, entry.name)
    return entry.isDirectory() ? listFiles(path) : [path]
  })
}

describe('mini-program remote image assets', () => {
  it('keeps only lightweight tabbar images in the mini-program source', () => {
    const localAssets = listFiles(localAssetsRoot)
    const localBytes = localAssets.reduce((total, file) => total + statSync(file).size, 0)

    expect(localAssets.every((file) => file.includes('/tabbar/'))).toBe(true)
    expect(localBytes).toBeLessThan(2 * 1024 * 1024)
  })

  it('publishes the moved images through the PC web project', () => {
    const expectedAssets = [
      'home/avatar-chen.png',
      'home/avatar-jasper.png',
      'home/avatar-miles.png',
      'home/empty-gift-box.png',
      'home/icon-bell.png',
      'me/auth-guardian.png',
      'me/avatar-profile.png',
      'me/mascot-sprout.png',
      'me/notification-bell.png',
      'accounts/account-add-hero.png',
      'accounts/account-success.png',
      'tasks/task-checklist.png',
    ]

    expectedAssets.forEach((asset) => expect(existsSync(resolve(webAssetsRoot, asset))).toBe(true))
  })
})
