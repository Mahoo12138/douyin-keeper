import { describe, expect, it } from 'vitest'

import { resolveMiniNavbarMetrics } from './mini-navbar-utils'

describe('mini navbar metrics', () => {
  it('keeps content below the status bar and to the left of the WeChat capsule', () => {
    expect(resolveMiniNavbarMetrics(375, 47, { top: 51, left: 281, height: 32 })).toEqual({
      statusBarHeight: 47,
      rowHeight: 44,
      capsuleInset: 102,
    })
  })

  it('uses stable H5 fallbacks when no native capsule exists', () => {
    expect(resolveMiniNavbarMetrics(375, 0)).toEqual({ statusBarHeight: 0, rowHeight: 44, capsuleInset: 16 })
  })
})
