import { useState } from 'react'
import { Button, Input, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'

import { linkWechatMini, loginWechatMini, MiniApiError } from '@/lib/api'
import { clearAccessToken, getAccessToken, setAccessToken } from '@/lib/session'

export default function Login() {
  const [linkCode, setLinkCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [hasToken, setHasToken] = useState(() => !!getAccessToken())

  async function runWechatLogin() {
    setBusy(true)
    setMessage('')
    try {
      const result = await Taro.login()
      const session = await loginWechatMini(result.code)
      setAccessToken(session.access_token)
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
      setAccessToken(session.access_token)
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
    clearAccessToken()
    setHasToken(false)
    setMessage('已清除本机登录态')
  }

  return <View className="mini-page"><View className="mini-hero card"><Text className="eyebrow">M4 · 微信身份</Text><Text className="title mini-hero-title">我的</Text><Text className="muted">使用微信身份登录，或输入 PC 端生成的一次性绑定码。</Text></View><View className="card auth-card"><Text className="card-title">微信登录</Text><Text className="muted">已绑定过微信身份？直接登录并进入移动控制台。</Text><Button className="mini-button primary-button" disabled={busy} onClick={() => void runWechatLogin()}>{busy ? '处理中…' : '微信登录'}</Button></View><View className="card auth-card"><Text className="card-title">绑定 PC 账号</Text><Text className="muted">在 PC 端“我的”页面生成绑定码，再粘贴到这里。</Text><Input className="code-input" value={linkCode} maxlength={32} placeholder="例如 ABCD-EFGH" onInput={(event) => setLinkCode(event.detail.value)} /><Button className="mini-button secondary-button" disabled={busy || !linkCode.trim()} onClick={() => void runLink()}>绑定已有账号</Button></View>{hasToken && <View className="card auth-card"><Text className="muted">本机已保存登录态。</Text><Button className="mini-button link-button" onClick={logout}>退出并清除登录态</Button></View>}{message && <View className="card error-card"><Text>{message}</Text></View>}</View>
}

function authError(cause: unknown) {
  if (cause instanceof MiniApiError && cause.code === 'WECHAT_NOT_LINKED') return '微信身份尚未绑定，请先在 PC 端生成绑定码。'
  return cause instanceof Error ? cause.message : '登录失败，请稍后重试。'
}
