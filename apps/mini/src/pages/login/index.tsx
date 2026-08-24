import { useEffect, useState } from 'react'
import { Button, Input, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'

import { getNotificationPreferences, linkWechatMini, loginWechatMini, MiniApiError, updateNotificationPreferences } from '@/lib/api'
import { clearSession, getAccessToken, setSession } from '@/lib/session'

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

  useEffect(() => {
    const token = getAccessToken()
    if (!token || !hasToken) return
    void getNotificationPreferences(token)
      .then((preferences) => setWechatNotificationsEnabled(preferences.wechat_enabled))
      .catch(() => setMessage('通知设置暂时不可用，请稍后重试。'))
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
    setMessage('已清除本机登录态')
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

  return <View className="mini-page"><View className="mini-hero card"><Text className="eyebrow">M4 · 微信身份</Text><Text className="title mini-hero-title">我的</Text><Text className="muted">使用微信身份登录，或输入 PC 端生成的一次性绑定码。</Text></View><View className="card auth-card"><Text className="card-title">微信登录</Text><Text className="muted">已绑定过微信身份？直接登录并进入移动控制台。</Text><Button className="mini-button primary-button" disabled={busy} onClick={() => void runWechatLogin()}>{busy ? '处理中…' : '微信登录'}</Button></View><View className="card auth-card"><Text className="card-title">绑定 PC 账号</Text><Text className="muted">在 PC 端“我的”页面生成绑定码，再粘贴到这里。</Text><Input className="code-input" value={linkCode} maxlength={32} placeholder="例如 ABCD-EFGH" onInput={(event) => setLinkCode(event.detail.value)} /><Button className="mini-button secondary-button" disabled={busy || !linkCode.trim()} onClick={() => void runLink()}>绑定已有账号</Button></View>{hasToken && <><View className="card auth-card"><Text className="card-title">微信服务通知</Text><Text className="muted">授权后，登录失效和安全验证会通过微信提醒；站内通知始终保留。</Text><Button className="mini-button secondary-button" disabled={notificationBusy} onClick={() => void toggleWechatNotifications()}>{notificationBusy ? '处理中…' : wechatNotificationsEnabled ? '关闭微信通知' : '开启微信通知'}</Button></View><View className="card auth-card"><Text className="muted">本机已保存登录态。</Text><Button className="mini-button link-button" onClick={logout}>退出并清除登录态</Button></View></>}{message && <View className="card error-card"><Text>{message}</Text></View>}</View>
}

function authError(cause: unknown) {
  if (cause instanceof MiniApiError && (cause.code === 'WECHAT_NOT_LINKED' || cause.code === 'WECHAT_IDENTITY_NOT_LINKED')) return '微信身份尚未绑定，请先在 PC 端生成绑定码。'
  return cause instanceof Error ? cause.message : '登录失败，请稍后重试。'
}
