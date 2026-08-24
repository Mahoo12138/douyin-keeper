import test from 'node:test'
import assert from 'node:assert/strict'

import { adminNav } from '../src/features/admin/admin-shell'

test('admin navigation stays aligned with the unified SPA route contract', () => {
  assert.deepEqual(adminNav.map((item) => item.to), [
    '/admin',
    '/admin/users',
    '/admin/accounts',
    '/admin/risks',
    '/admin/workers',
    '/admin/adapters',
    '/admin/settings',
    '/admin/entitlement',
    '/admin/audit',
  ])
  assert.equal(adminNav.find((item) => item.to === '/admin')?.exact, true)
})
