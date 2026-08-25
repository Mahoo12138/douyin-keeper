import assert from 'node:assert/strict'
import test from 'node:test'

import { apiProxy } from '../vite-proxy'

test('Vite API proxy preserves Host for cookie-backed same-origin auth', () => {
  assert.equal(apiProxy.target, 'http://127.0.0.1:8080')
  assert.equal(apiProxy.changeOrigin, false)
})
