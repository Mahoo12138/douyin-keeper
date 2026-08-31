import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const templates = source('../src/features/templates/message-templates-page.tsx')
const entitlements = source('../src/features/admin/admin-entitlement-panels.tsx')
const settings = source('../src/features/admin/admin-settings-page.tsx')
const accounts = source('../src/features/accounts/account-binding-flow.tsx')
const accountPanel = source('../src/features/accounts/account-binding-panel.tsx')
const header = source('../src/components/global-header.tsx')
const confirmDialog = source('../src/components/confirm-dialog.tsx')
const tasks = source('../src/features/tasks/tasks-page.tsx')
const conversations = source('../src/features/conversations/conversations-page.tsx')
const adminUser = source('../src/routes/admin/users/$userId.tsx')

test('form-heavy surfaces use the shared Radix dialog pattern', () => {
  assert.match(templates, /<Dialog open=\{!!editor\}/)
  assert.match(templates, /<DialogContent>/)
  assert.match(entitlements, /function RevokeDialog/)
  assert.match(entitlements, /<DialogContent className="max-w-3xl">/)
  assert.match(settings, /<Dialog open=\{formOpen\}/)
})

test('account binding guards quota with a recoverable entitlement dialog', () => {
  assert.match(accounts, /entitlementDialogOpen/)
  assert.match(accounts, /先激活权益，再添加账号/)
  assert.match(accounts, /to="\/entitlement"/)
})

test('deployed account binding never tells the user to operate an invisible browser window', () => {
  for (const bindingSource of [accounts, accountPanel]) {
    assert.doesNotMatch(bindingSource, /打开的抖音窗口|新打开窗口|不要关闭窗口/)
  }
})

test('avatar menu keeps identity, workspace actions, and sign-out discoverable', () => {
  assert.match(header, /工作区/)
  assert.match(header, /帮助与安全边界/)
  assert.match(header, /管理控制台/)
  assert.match(header, /退出登录/)
})

test('destructive and platform confirmation flows use the shared Radix dialog', () => {
  for (const page of [tasks, conversations, templates, adminUser]) assert.doesNotMatch(page, /window\.(confirm|alert|prompt)/)
  assert.match(confirmDialog, /<Dialog open=\{open\}/)
  assert.match(confirmDialog, /<DialogContent className="max-w-md">/)
})
