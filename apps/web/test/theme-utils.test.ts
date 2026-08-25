import assert from 'node:assert/strict'
import test from 'node:test'

import { COLOR_SCHEMES, THEME_CONFIG } from '@douyin-keeper/ui-web'

test('theme configuration exposes every tinyship color scheme', () => {
  assert.deepEqual(COLOR_SCHEMES, ['default', 'claude', 'cosmic-night', 'modern-minimal', 'ocean-breeze', 'perplexity'])
  for (const scheme of COLOR_SCHEMES) {
    assert.ok(THEME_CONFIG[scheme].name)
    assert.match(THEME_CONFIG[scheme].color, /^#/) 
  }
})
