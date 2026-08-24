import test from 'node:test'
import assert from 'node:assert/strict'

import { notFoundCopy } from '../src/features/navigation/not-found-content'

test('not found copy gives the user a clear recovery action', () => {
  assert.equal(notFoundCopy.title, '页面不存在')
  assert.match(notFoundCopy.description, /地址/)
  assert.equal(notFoundCopy.homeLabel, '返回概览')
})
