import { describe, expect, it } from 'vitest'

import { visibleMiniAccounts } from './account-utils'

describe('mini account list', () => {
  it('keeps binding and bound accounts while hiding released placeholders', () => {
    const accounts = [
      { id: 'released', binding_status: 'unbound' },
      { id: 'binding', binding_status: 'binding' },
      { id: 'bound', binding_status: 'bound' },
    ]

    expect(visibleMiniAccounts(accounts).map((account) => account.id)).toEqual(['binding', 'bound'])
  })
})
