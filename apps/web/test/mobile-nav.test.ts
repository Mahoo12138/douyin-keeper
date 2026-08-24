import test from 'node:test'
import assert from 'node:assert/strict'

import { isMobileNavDismissKey } from '../src/features/navigation/mobile-nav'

test('mobile navigation only dismisses for Escape', () => {
  assert.equal(isMobileNavDismissKey('Escape'), true)
  assert.equal(isMobileNavDismissKey('Enter'), false)
  assert.equal(isMobileNavDismissKey('Esc'), false)
})
