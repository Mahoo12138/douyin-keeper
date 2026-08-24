import test from 'node:test'
import assert from 'node:assert/strict'

import { adminNav, adminNavGroups } from '../src/features/admin/admin-shell'

test('admin navigation stays aligned with the unified SPA route contract', () => {
  assert.deepEqual(adminNav.map((item) => item.to), [
    '/admin',
    '/admin/users',
    '/admin/accounts',
    '/admin/risks',
    '/admin/workers',
    '/admin/jobs',
    '/admin/adapters',
    '/admin/settings',
    '/admin/entitlement',
    '/admin/audit',
  ])
  assert.equal(adminNav.find((item) => item.to === '/admin')?.exact, true)
})

test('admin navigation groups keep overview, operations, and settings discoverable', () => {
  assert.deepEqual(adminNavGroups.map((group) => group.label), ['概览', '资源与运营', '系统配置'])
  assert.deepEqual(adminNavGroups.map((group) => group.items.map((item) => item.to)), [
    ['/admin'],
    ['/admin/users', '/admin/accounts', '/admin/risks', '/admin/workers', '/admin/jobs', '/admin/adapters'],
    ['/admin/settings', '/admin/entitlement', '/admin/audit'],
  ])
})
