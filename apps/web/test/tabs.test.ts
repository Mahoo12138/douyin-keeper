import test from 'node:test'
import assert from 'node:assert/strict'

import { getNextTabIndex } from '../../../packages/ui-web/src/ui/tabs'

test('tabs keyboard navigation wraps and supports Home/End', () => {
  assert.equal(getNextTabIndex(0, 3, 'ArrowRight'), 1)
  assert.equal(getNextTabIndex(2, 3, 'ArrowRight'), 0)
  assert.equal(getNextTabIndex(0, 3, 'ArrowLeft'), 2)
  assert.equal(getNextTabIndex(1, 3, 'ArrowUp'), 0)
  assert.equal(getNextTabIndex(1, 3, 'Home'), 0)
  assert.equal(getNextTabIndex(0, 3, 'End'), 2)
})

test('tabs keep the current index for unrelated keys and empty lists', () => {
  assert.equal(getNextTabIndex(1, 3, 'Enter'), 1)
  assert.equal(getNextTabIndex(0, 0, 'ArrowRight'), -1)
})
