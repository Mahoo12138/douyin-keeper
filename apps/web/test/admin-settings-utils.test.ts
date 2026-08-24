import assert from 'node:assert/strict'
import test from 'node:test'

import { formatSettingValue, isSettingKeyValid, parseSettingValue } from '../src/features/admin/admin-settings-utils.ts'

test('setting keys accept namespaced safe identifiers only', () => {
	assert.equal(isSettingKeyValid('feature.notice'), true)
	assert.equal(isSettingKeyValid('Bad Key'), false)
	assert.equal(isSettingKeyValid('wechat.secret'), false)
})

test('setting values parse JSON and expose actionable errors', () => {
	assert.deepEqual(parseSettingValue('{"enabled":true}'), { value: { enabled: true }, error: null })
	assert.equal(parseSettingValue('{').error, '请输入合法 JSON，例如 {"enabled":true}。')
})

test('setting values are formatted for readable editing', () => {
	assert.equal(formatSettingValue({ enabled: true }), '{\n  "enabled": true\n}')
	assert.equal(formatSettingValue(undefined), 'null')
})
