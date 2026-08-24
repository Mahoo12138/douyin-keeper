import { useEffect, useState } from 'react'
import { Button, Input, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'

import { getNotificationPreferences, linkWechatMini, loginWechatMini, MiniApiError, myEntitlement, redeemCardCode, updateNotificationPreferences } from '@/lib/api'
import { clearSession, getAccessToken, setSession } from '@/lib/session'
import { entitlementStatus, formatEntitlementDate, normalizeRedeemCode, quotaLabel } from '@/features/entitlement/entitlement-utils'

const notificationTemplateId = process.env.TARO_APP_WECHAT_NOTIFICATION_TEMPLATE_ID || ''

// Taro 4.2's shared declaration incorrectly requires Alipay's `entityIds`
// alongside WeChat's `tmplIds`; the WeChat runtime only accepts the latter.
const requestWechatSubscribe = Taro.requestSubscribeMessage as unknown as (options: { tmplIds: string[] }) => Promise<Record<string, string>>

export default function Login() {
  const [linkCode, setLinkCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [hasToken, setHasToken] = useState(() => !!getAccessToken())
  const [wechatNotificationsEnabled, setWechatNotificationsEnabled] = useState(false)
  const [notificationBusy, setNotificationBusy] = useState(false)
  const [entitlement, setEntitlement] = useState<Awaited<ReturnType<typeof myEntitlement>> | null>(null)
  const [entitlementBusy, setEntitlementBusy] = useState(false)
  const [redeemCode, setRedeemCode] = useState('')

  useEffect(() => {
    const token = getAccessToken()
    if (!token || !hasToken) return
    void Promise.all([getNotificationPreferences(token), myEntitlement(token)])
      .then(([preferences, currentEntitlement]) => {
        setWechatNotificationsEnabled(preferences.wechat_enabled)
        setEntitlement(currentEntitlement)
      })
      .catch(() => setMessage('账号权益或通知设置暂时不可用，请稍后重试。'))
  }, [hasToken])

  async function runWechatLogin() {
    setBusy(true)
    setMessage('')
    try {
      const result = await Taro.login()
      const session = await loginWechatMini(result.code)
      setSession(session)
      setWechatNotificationsEnabled(false)
      setHasToken(true)
      await Taro.showToast({ title: '登录成功', icon: 'success' })
      await Taro.switchTab({ url: '/pages/index/index' })
    } catch (cause) {
      setMessage(authError(cause))
    } finally {
      setBusy(false)
    }
  }

  async function runLink() {
    if (!linkCode.trim()) return
    setBusy(true)
    setMessage('')
    try {
      const result = await Taro.login()
      const session = await linkWechatMini(result.code, linkCode.trim().toUpperCase())
      setSession(session)
      setWechatNotificationsEnabled(false)
      setHasToken(true)
      await Taro.showToast({ title: '绑定成功', icon: 'success' })
      await Taro.switchTab({ url: '/pages/index/index' })
    } catch (cause) {
      setMessage(authError(cause))
    } finally {
      setBusy(false)
    }
  }

  function logout() {
    clearSession()
    setHasToken(false)
    setWechatNotificationsEnabled(false)
    setEntitlement(null)
    setRedeemCode('')
    setMessage('已清除本机登录态')
  }

  async function redeem() {
    const token = getAccessToken()
    const code = normalizeRedeemCode(redeemCode)
    if (!token || !code || entitlementBusy) return
    setEntitlementBusy(true)
    setMessage('')
    try {
      const result = await redeemCardCode(token, code)
      setEntitlement(result.entitlement)
      setRedeemCode('')
      await Taro.showToast({ title: '兑换成功', icon: 'success' })
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : '卡密兑换失败，请稍后重试。')
    } finally {
      setEntitlementBusy(false)
    }
  }

  async function toggleWechatNotifications() {
    const token = getAccessToken()
    if (!token || notificationBusy) return
    setNotificationBusy(true)
    setMessage('')
    try {
      if (!wechatNotificationsEnabled) {
        if (!notificationTemplateId) {
          setMessage('小程序尚未配置通知模板，请联系管理员。')
          return
        }
        const result = await requestWechatSubscribe({ tmplIds: [notificationTemplateId] })
        if (result[notificationTemplateId] !== 'accept' && result[notificationTemplateId] !== 'acceptWithAudio') {
          setMessage('你未授权微信服务通知，账号风险仍会显示在站内通知中。')
          return
        }
      }
      const preferences = await updateNotificationPreferences(token, !wechatNotificationsEnabled)
      setWechatNotificationsEnabled(preferences.wechat_enabled)
      await Taro.showToast({ title: preferences.wechat_enabled ? '已开启通知' : '已关闭通知', icon: 'success' })
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : '通知设置失败，请稍后重试。')
    } finally {
      setNotificationBusy(false)
    }
  }

  return <View className="mini-page"><View className="mini-hero card"><Text className="eyebrow">M4 · 微信身份</Text><Text className="title mini-hero-title">我的</Text><Text className="muted">使用微信身份登录，或输入 PC 端生成的一次性绑定码。</Text></View><View className="card auth-card"><Text className="card-title">微信登录</Text><Text className="muted">已绑定过微信身份？直接登录并进入移动控制台。</Text><Button className="mini-button primary-button" disabled={busy} onClick={() => void runWechatLogin()}>{busy ? '处理中…' : '微信登录'}</Button></View><View className="card auth-card"><Text className="card-title">绑定 PC 账号</Text><Text className="muted">在 PC 端“我的”页面生成绑定码，再粘贴到这里。</Text><Input className="code-input" value={linkCode} maxlength={32} placeholder="例如 ABCD-EFGH" onInput={(event) => setLinkCode(event.detail.value)} /><Button className="mini-button secondary-button" disabled={busy || !linkCode.trim()} onClick={() => void runLink()}>绑定已有账号</Button></View>{hasToken && <><View className="card auth-card"><View className="card-heading"><Text className="card-title">当前权益</Text><Text className={`status-dot ${entitlement?.active ? 'status-dot-success' : 'status-dot-warning'}`}>{entitlementStatus(entitlement?.active ?? false)}</Text></View><Text className="account-name">{entitlement?.plan_code ?? '暂无可用权益'}</Text><Text className="muted">有效期至：{formatEntitlementDate(entitlement?.expires_at)}</Text><View className="quota-grid"><View><Text className="quota-value">{quotaLabel(entitlement?.usage?.accounts_used, entitlement?.account_quota)}</Text><Text className="muted">账号配额</Text></View><View><Text className="quota-value">{quotaLabel(entitlement?.usage?.tasks_used, entitlement?.task_quota)}</Text><Text className="muted">任务配额</Text></View><View><Text className="quota-value">{quotaLabel(entitlement?.usage?.daily_send_reserved, entitlement?.daily_send_quota)}</Text><Text className="muted">每日发送</Text></View></View></View><View className="card auth-card"><Text className="card-title">兑换卡密</Text><Text className="muted">输入 DK1 开头的卡密，兑换后会刷新当前权益。</Text><Input className="code-input" value={redeemCode} maxlength={128} placeholder="DK1-XXXXX-…" onInput={(event) => setRedeemCode(event.detail.value)} /><Button className="mini-button secondary-button" disabled={entitlementBusy || !redeemCode.trim()} onClick={() => void redeem()}>{entitlementBusy ? '兑换中…' : '兑换卡密'}</Button></View><View className="card auth-card"><Text className="card-title">微信服务通知</Text><Text className="muted">授权后，登录失效和安全验证会通过微信提醒；站内通知始终保留。</Text><Button className="mini-button secondary-button" disabled={notificationBusy} onClick={() => void toggleWechatNotifications()}>{notificationBusy ? '处理中…' : wechatNotificationsEnabled ? '关闭微信通知' : '开启微信通知'}</Button></View><View className="card auth-card"><Text className="muted">本机已保存登录态。</Text><Button className="mini-button link-button" onClick={logout}>退出并清除登录态</Button></View></>}{message && <View className="card error-card"><Text>{message}</Text></View>}</View>
}

function authError(cause: unknown) {
  if (cause instanceof MiniApiError && (cause.code === 'WECHAT_NOT_LINKED' || cause.code === 'WECHAT_IDENTITY_NOT_LINKED')) return '微信身份尚未绑定，请先在 PC 端生成绑定码。'
  return cause instanceof Error ? cause.message : '登录失败，请稍后重试。'
}
