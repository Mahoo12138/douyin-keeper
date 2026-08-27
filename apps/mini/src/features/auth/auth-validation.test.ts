import { describe, expect, it } from 'vitest'

import { AUTH_CONSENT_ERROR, authConsentError } from './auth-validation'

describe('authentication consent validation', () => {
  it('allows authentication after consent', () => {
    expect(authConsentError(true)).toBe('')
  })

  it('blocks authentication without consent', () => {
    expect(authConsentError(false)).toBe(AUTH_CONSENT_ERROR)
  })
})
