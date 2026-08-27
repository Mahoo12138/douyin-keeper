import { describe, expect, it } from 'vitest'

import { accountTabLabel } from './account-tab-utils'

describe('account tab labels', () => {
  it('keeps named accounts concise', () => {
    expect(accountTabLabel({ id: 'account-1', nickname: '隐隐控', binding_status: 'bound' })).toBe('隐隐控')
  })

  it('distinguishes unnamed binding placeholders', () => {
    expect(accountTabLabel({ id: '437b01ef-4380', binding_status: 'binding' })).toBe('绑定中 · 437b01')
    expect(accountTabLabel({ id: '1844233e-9ae7', binding_status: 'binding' })).not.toBe('绑定中 · 437b01')
  })
})
