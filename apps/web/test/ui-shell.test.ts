import assert from 'node:assert/strict'
import test from 'node:test'

import {
  Dialog,
  DialogContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@douyin-keeper/ui-web'

test('shared dropdown menu exports the keyboard-accessible shell primitives', () => {
  for (const primitive of [DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger]) {
    assert.ok(primitive)
    assert.ok(['function', 'object'].includes(typeof primitive))
  }
})

test('shared dialog exports the accessible modal shell primitives', () => {
  for (const primitive of [Dialog, DialogContent]) {
    assert.ok(primitive)
    assert.ok(['function', 'object'].includes(typeof primitive))
  }
})
