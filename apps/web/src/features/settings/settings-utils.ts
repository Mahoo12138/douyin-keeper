export function notificationPreferenceLabel(enabled: boolean) {
	return enabled ? '微信服务通知已授权' : '请在微信小程序中授权开启'
}

export function formatPreferenceUpdatedAt(value: string | null | undefined) {
	return value ? new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '尚未记录'
}
