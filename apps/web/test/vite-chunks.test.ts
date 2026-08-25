import assert from 'node:assert/strict'
import test from 'node:test'

import { manualChunks } from '../vite-chunks'

test('manualChunks keeps runtime and route dependencies in bounded vendor chunks', () => {
  assert.equal(manualChunks('/repo/node_modules/react/index.js'), 'vendor-react')
  assert.equal(manualChunks('/repo/node_modules/@tanstack/react-router/dist/index.js'), 'vendor-router')
  assert.equal(manualChunks('/repo/node_modules/@tanstack/react-query/build/index.js'), 'vendor-query')
  assert.equal(manualChunks('/repo/node_modules/lucide-react/dist/cjs/lucide.js'), 'vendor-icons')
  assert.equal(manualChunks('/repo/node_modules/@radix-ui/react-dropdown-menu/dist/index.js'), 'vendor-ui')
  assert.equal(manualChunks('/repo/node_modules/zod/index.js'), 'vendor-forms')
  assert.equal(manualChunks('/repo/apps/web/src/routes/dashboard.tsx'), undefined)
})
