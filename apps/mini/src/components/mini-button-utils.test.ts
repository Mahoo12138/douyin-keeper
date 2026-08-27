import { describe, expect, it } from 'vitest'

import { miniButtonDisabledProps } from './mini-button-utils'

describe('mini button disabled props', () => {
  it('omits the disabled attribute for enabled buttons', () => {
    expect(miniButtonDisabledProps(false)).toEqual({})
    expect(miniButtonDisabledProps(undefined)).toEqual({})
  })

  it('keeps the disabled attribute for disabled buttons', () => {
    expect(miniButtonDisabledProps(true)).toEqual({ disabled: true })
  })
})
