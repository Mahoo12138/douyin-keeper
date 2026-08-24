import test from 'node:test'
import assert from 'node:assert/strict'

import { helpSections, privacySections } from '../src/features/help/help-content'

test('web help covers binding, task setup, and risk handling', () => {
  assert.deepEqual(helpSections.map((section) => section.title), ['首次绑定', '配置任务', '处理风险提醒'])
  assert.ok(helpSections.every((section) => section.body.length > 20))
})

test('web help keeps platform credential and anti-bypass boundaries explicit', () => {
  assert.deepEqual(privacySections.map((section) => section.title), ['平台凭据', '微信身份', '产品边界'])
  const copy = privacySections.map((section) => section.body).join('')
  assert.match(copy, /session_key/)
  assert.match(copy, /验证码绕过/)
})
