import test from 'node:test'
import assert from 'node:assert/strict'

import { isOverlayDismissKey } from '../../../packages/ui-web/src/hooks/use-overlay'

test('overlays dismiss only on Escape', () => {
  assert.equal(isOverlayDismissKey('Escape'), true)
  assert.equal(isOverlayDismissKey('Enter'), false)
  assert.equal(isOverlayDismissKey('Tab'), false)
})
