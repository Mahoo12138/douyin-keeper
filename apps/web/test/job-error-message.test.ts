import assert from 'node:assert/strict'
import test from 'node:test'

import { jobErrorMessage, jobErrorMessageFromError, userFacingNotificationBody } from '../src/lib/job-error-message'

test('user-facing job errors explain the failure and recovery without exposing codes', () => {
  const conversation = jobErrorMessage('CONVERSATION_NOT_FOUND')
  assert.match(conversation, /会话已失效/)
  assert.match(conversation, /重新创建/)
  assert.doesNotMatch(conversation, /CONVERSATION_NOT_FOUND/)

  const unknown = jobErrorMessage('PRIVATE_INTERNAL_CODE', '发送失败，请联系支持。')
  assert.equal(unknown, '发送失败，请联系支持。')
  assert.doesNotMatch(unknown, /PRIVATE_INTERNAL_CODE/)
})

test('API errors use mapped recovery copy and never expose a private code as the message', () => {
  const coded = Object.assign(new Error('internal transport failed'), { code: 'SESSION_EXPIRED' })
  assert.match(jobErrorMessageFromError(coded), /重新登录/)
  assert.equal(jobErrorMessageFromError(new Error('PRIVATE_INTERNAL_CODE'), '发送失败，请稍后再试。'), '发送失败，请稍后再试。')
})

test('notification bodies replace known and unknown internal codes with readable copy', () => {
  const known = userFacingNotificationBody('账号出现运行风险：CONVERSATION_NOT_FOUND。')
  assert.match(known, /会话已失效/)
  assert.doesNotMatch(known, /CONVERSATION_NOT_FOUND/)
  assert.equal(userFacingNotificationBody('账号出现运行风险：PRIVATE_INTERNAL_CODE。'), '账号出现运行风险：系统运行异常，请稍后再试。')
})
