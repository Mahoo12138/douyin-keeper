import assert from 'node:assert/strict'
import test from 'node:test'

import { flattenPageItems } from '../src/lib/query-utils'

test('flattenPageItems preserves cursor page order for dashboard and detail sections', () => {
  assert.deepEqual(flattenPageItems([{ items: ['first', 'second'] }, { items: ['third'] }]), ['first', 'second', 'third'])
})

test('flattenPageItems treats empty pages and null items as an empty result', () => {
  assert.deepEqual(flattenPageItems([null, undefined, { items: null }, { items: ['visible', null] }]), ['visible'])
})
