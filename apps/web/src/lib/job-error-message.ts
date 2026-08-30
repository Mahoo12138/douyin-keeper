const jobErrorLabels: Record<string, string> = {
  ACCOUNT_BUSY: '账号正在处理其他操作，本次尚未发送。请稍后再试。',
  ACCOUNT_COOLDOWN_ACTIVE: '账号处于安全冷却期，本次尚未发送。请稍后再试。',
  ACCOUNT_IDENTITY_MISMATCH: '当前登录的抖音账号与任务账号不一致，本次已停止。请重新登录正确账号。',
  ACCOUNT_IDENTITY_UNRESOLVED: '系统还不能确认当前抖音账号身份。请重新登录后再试。',
  ACCOUNT_PAUSED: '这个账号的任务已暂停，本次尚未发送。请先恢复账号任务。',
  ACCOUNT_RELEASED: '这个抖音账号已解除绑定，本次无法发送。请重新绑定账号。',
  ADAPTER_INCOMPATIBLE: '发送通道未能确认本次结果。请先在抖音会话中确认是否已出现消息，避免重复发送；若没有，请稍后再试。',
  ADAPTER_UNAVAILABLE: '发送通道暂时不可用，本次尚未发送。请稍后再试。',
  BROWSER_SELECTOR_CHANGED: '抖音发送页面结构已变化，系统未执行发送。请稍后再试。',
  CHALLENGE_REQUIRED: '抖音要求完成安全验证，本次尚未发送。请先完成验证后再试。',
  CONVERSATION_NOT_FOUND: '任务关联的会话已失效，消息没有发送。请删除该任务，并从当前会话重新创建。',
  DAILY_SEND_QUOTA_EXCEEDED: '今天的发送额度已用完，本次没有发送。请明天再试。',
  ENTITLEMENT_EXPIRED: '当前权益已过期，本次没有发送。请续期后再试。',
  ENTITLEMENT_REQUIRED: '当前操作需要有效权益，本次没有发送。请先开通权益。',
  FEATURE_NOT_ENTITLED: '当前权益不支持这项发送能力，本次没有发送。',
  FRIEND_AMBIGUOUS: '系统找到多个可能的目标会话，为防止发错人已停止发送。请重新同步并确认会话。',
  FRIEND_IDENTITY_UNRESOLVED: '会话身份尚未确认，为防止发错人已停止发送。请重新同步会话。',
  FRIEND_NOT_FOUND: '任务关联的会话已失效，消息没有发送。请重新同步会话后再创建任务。',
  NETWORK_TIMEOUT: '连接抖音超时，发送结果暂时无法确认。请先检查会话中是否已出现消息，避免重复发送。',
  OUTCOME_UNKNOWN: '发送结果暂时无法确认。请先检查抖音会话，避免重复发送。',
  PLATFORM_RATE_LIMITED: '抖音限制了当前操作频率，本次尚未发送。请稍后再试。',
  SESSION_EXPIRED: '抖音登录状态已过期，本次尚未发送。请重新登录账号。',
  TARGET_IDENTITY_MISMATCH: '任务目标与当前抖音会话不一致，为防止发错人已停止发送。请重新同步会话。',
}

export function jobErrorMessage(code: string | null | undefined, fallback = '任务执行失败，本次发送未完成。请稍后再试。') {
  return (code && jobErrorLabels[code]) || fallback
}

export function jobErrorMessageFromError(error: unknown, fallback = '任务执行失败，本次发送未完成。请稍后再试。') {
  const code = typeof (error as { code?: unknown } | null)?.code === 'string'
    ? (error as { code: string }).code
    : ''
  if (code && jobErrorLabels[code]) return jobErrorLabels[code]
  const message = error instanceof Error ? error.message.trim() : ''
  return message && !/^[A-Z][A-Z0-9_]+$/.test(message) ? message : fallback
}

export function userFacingNotificationBody(body: string) {
  return String(body || '').replace(/\b[A-Z][A-Z0-9_]{2,}\b/g, (code) =>
    jobErrorMessage(code, '系统运行异常，请稍后再试。').replace(/[。；]$/, ''))
}
