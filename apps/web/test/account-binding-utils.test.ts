import test from 'node:test'
import assert from 'node:assert/strict'

import { bindingErrorMessage, bindingMethodLabel, isSMSPhoneValid } from '../src/features/accounts/account-binding-utils'

test('accepts common international phone formats for SMS binding', () => {
  assert.equal(isSMSPhoneValid('+86 13800138000'), true)
  assert.equal(isSMSPhoneValid('138-0013-8000'), true)
  assert.equal(isSMSPhoneValid(''), false)
  assert.equal(isSMSPhoneValid('abc13800138000'), false)
})

test('labels binding methods for the shared flow', () => {
  assert.equal(bindingMethodLabel('qr'), '扫码登录')
  assert.equal(bindingMethodLabel('sms'), '短信验证码登录')
})

test('explains re-login identity mismatch without implying the old session was replaced', () => {
  assert.match(bindingErrorMessage('error', 'ACCOUNT_IDENTITY_MISMATCH'), /原有登录态未改变/)
  assert.equal(bindingErrorMessage('challenge_required'), '需要完成平台安全验证。')
})
