const settingKeyPattern = /^[a-z][a-z0-9_.-]{0,63}$/
const sensitiveFragments = ['password', 'secret', 'token', 'cookie', 'session', 'credential', 'private_key']

export function isSettingKeyValid(key: string) {
	const normalized = key.trim().toLowerCase()
	return settingKeyPattern.test(normalized) && !sensitiveFragments.some((fragment) => normalized.includes(fragment))
}

export function parseSettingValue(raw: string) {
	try {
		return { value: JSON.parse(raw) as unknown, error: null }
	} catch {
		return { value: undefined, error: '请输入合法 JSON，例如 {"enabled":true}。' }
	}
}

export function formatSettingValue(value: unknown) {
	const formatted = JSON.stringify(value, null, 2)
	return formatted === undefined ? 'null' : formatted
}
