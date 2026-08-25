import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../src/features/landing/landing-page.tsx', import.meta.url), 'utf8')

test('landing page keeps the conversion path and product-boundary sections', () => {
  assert.match(source, /to="\/signup"/)
  assert.match(source, /to="\/signin"/)
  assert.match(source, /id="how-it-works"/)
  assert.match(source, /id="principles"/)
  assert.match(source, /id="start"/)
  assert.match(source, /风险暂停/)
})
