import { describe, expect, it } from 'vitest'

import { resolveMiniAssetUrl } from './mini-assets'

describe('resolveMiniAssetUrl', () => {
  it('joins a configured PC asset origin and asset name', () => {
    expect(resolveMiniAssetUrl('https://keeper.example.com/mini-assets/', '/home/avatar-chen.png'))
      .toBe('https://keeper.example.com/mini-assets/home/avatar-chen.png')
  })

  it('returns a local fallback path when the base URL is not configured', () => {
    expect(resolveMiniAssetUrl('', 'me/auth-guardian.png')).toBe('/me/auth-guardian.png')
  })
})
