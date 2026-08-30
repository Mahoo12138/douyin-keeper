import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('mini-program WXSS compatibility', () => {
  it('does not use unsupported structural pseudo-class selectors', () => {
    const stylesheet = readFileSync(resolve(__dirname, '../src/app.css'), 'utf8')

    expect(stylesheet).not.toMatch(/:(?:first|last|nth|only|not|empty)-child\b/)
  })

  it('does not use attribute selectors unsupported by WXSS', () => {
    const stylesheet = readFileSync(resolve(__dirname, '../src/app.css'), 'utf8')

    expect(stylesheet).not.toMatch(/\[[^\]]+\]/)
  })

  it('keeps navbar actions circular and avoids a hard-coded capsule inset', () => {
    const stylesheet = readFileSync(resolve(__dirname, '../src/app.css'), 'utf8')

    expect(stylesheet).toMatch(/\.mini-navbar-action\s*\{[^}]*border-radius:\s*50%/s)
    expect(stylesheet).not.toContain('padding-right: 170rpx')
  })
})
