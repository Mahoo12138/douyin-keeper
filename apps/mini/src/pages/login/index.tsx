import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Button, Checkbox, Image, Input, Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'

import { getMe, getNotificationPreferences, listMyEntitlementGrants, listNotifications, linkWechatMini, loginPassword, loginWechatMini, logoutMini, markAllNotificationsRead, markNotificationRead, MiniApiError, myEntitlement, redeemCardCode, registerPassword, updateNotificationPreferences } from '@/lib/api'
import { clearSession, getAccessToken, setSession } from '@/lib/session'
import { entitlementGrantStatus, entitlementSourceLabel, entitlementStatus, formatEntitlementDate, normalizeRedeemCode, quotaLabel } from '@/features/entitlement/entitlement-utils'
import { helpSections, privacySections } from '@/features/help/help-content'
import { notificationPriorityLabel } from '@/features/notification/notification-utils'
import { consumeMeScreenTarget } from '@/features/navigation/mini-navigation'
import { authConsentError } from '@/features/auth/auth-validation'
import profileAvatar from '@/assets/me/avatar-profile.png'
import mascotSprout from '@/assets/me/mascot-sprout.png'
import authGuardian from '@/assets/me/auth-guardian.png'
import notificationBell from '@/assets/me/notification-bell.png'

const notificationTemplateId = typeof process !== 'undefined' ? process.env.TARO_APP_WECHAT_NOTIFICATION_TEMPLATE_ID || '' : ''
const requestWechatSubscribe = Taro.requestSubscribeMessage as unknown as ((options: { tmplIds: string[] }) => Promise<Record<string, string>>) | undefined
type MeScreen = 'overview' | 'entitlement' | 'history' | 'notifications' | 'settings'
type AuthMode = 'login' | 'register'
type OnboardingStage = 'splash' | 'welcome' | 'auth'

const onboardingSeenKey = 'douyin-keeper-mini-onboarding-seen'

export default function Me() {
  const [screen, setScreen] = useState<MeScreen>('overview')
  const [linkCode, setLinkCode] = useState('')
  const [authMode, setAuthMode] = useState<AuthMode>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [registerUsername, setRegisterUsername] = useState('')
  const [registerPasswordValue, setRegisterPasswordValue] = useState('')
  const [registerPasswordConfirm, setRegisterPasswordConfirm] = useState('')
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [hasToken, setHasToken] = useState(() => !!getAccessToken())
  const [user, setUser] = useState<Awaited<ReturnType<typeof getMe>> | null>(null)
  const [wechatNotificationsEnabled, setWechatNotificationsEnabled] = useState(false)
  const [entitlement, setEntitlement] = useState<Awaited<ReturnType<typeof myEntitlement>> | null>(null)
  const [redeemCode, setRedeemCode] = useState('')
  const [grantHistory, setGrantHistory] = useState<Awaited<ReturnType<typeof listMyEntitlementGrants>>['items']>([])
  const [grantCursor, setGrantCursor] = useState<string | null>(null)
  const [notifications, setNotifications] = useState<Awaited<ReturnType<typeof listNotifications>>['items']>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [notificationCursor, setNotificationCursor] = useState<string | null>(null)
  const [helpExpanded, setHelpExpanded] = useState(false)
  const [privacyExpanded, setPrivacyExpanded] = useState(false)
  const [onboardingStage, setOnboardingStage] = useState<OnboardingStage>(() => getAccessToken() || Taro.getStorageSync(onboardingSeenKey) ? 'auth' : 'splash')

  useEffect(() => {
    if (hasToken || onboardingStage !== 'splash') return
    const timer = setTimeout(() => setOnboardingStage('welcome'), 900)
    return () => clearTimeout(timer)
  }, [hasToken, onboardingStage])

  const loadProfile = useCallback(async () => {
    const token = getAccessToken()
    if (!token) return
    setMessage('')
    try {
      const [me, preferences, currentEntitlement, history, notificationList] = await Promise.all([
        getMe(token),
        getNotificationPreferences(token),
        myEntitlement(token),
        listMyEntitlementGrants(token, { limit: 10 }),
        listNotifications(token, { limit: 20 }),
      ])
      setUser(me)
      setWechatNotificationsEnabled(preferences.wechat_enabled)
      setEntitlement(currentEntitlement)
      setGrantHistory(history.items)
      setGrantCursor(history.next_cursor ?? null)
      setNotifications(notificationList.items)
      setUnreadCount(notificationList.unread_count)
      setNotificationCursor(notificationList.next_cursor ?? null)
    } catch (cause) {
      if (cause instanceof MiniApiError && cause.statusCode === 401) {
        clearSession()
        setHasToken(false)
        return
      }
      setMessage(cause instanceof Error ? cause.message : '我的页面数据暂时不可用，请稍后重试。')
    }
  }, [])

  useDidShow(() => {
    if (!getAccessToken()) return
    const target = consumeMeScreenTarget()
    if (target) setScreen(target)
    void loadProfile()
  })

  function ensureAuthConsent() {
    const error = authConsentError(termsAccepted)
    if (error) setMessage(error)
    return !error
  }

  async function runWechatLogin() {
    if (!ensureAuthConsent() || busy) return
    setBusy('login')
    setMessage('')
    try {
      const result = await Taro.login()
      const session = await loginWechatMini(result.code)
      setSession(session)
      setHasToken(true)
      void loadProfile()
      await Taro.showToast({ title: '登录成功', icon: 'success' })
    } catch (cause) {
      setMessage(authError(cause))
    } finally {
      setBusy('')
    }
  }

  async function runPasswordLogin() {
    if (!username.trim() || !password || busy || !ensureAuthConsent()) return
    setBusy('password-login')
    setMessage('')
    try {
      const session = await loginPassword(username.trim(), password)
      setSession(session)
      setPassword('')
      setHasToken(true)
      void loadProfile()
      await Taro.showToast({ title: '登录成功', icon: 'success' })
    } catch (cause) {
      setMessage(authError(cause))
    } finally {
      setBusy('')
    }
  }

  async function runPasswordRegister() {
    const name = registerUsername.trim()
    if (!name || !registerPasswordValue || !registerPasswordConfirm || busy) return
    if (!ensureAuthConsent()) return
    if (name.length < 3 || name.length > 64) {
      setMessage('用户名长度需为 3–64 个字符。')
      return
    }
    if (registerPasswordValue.length < 8 || registerPasswordValue.length > 256) {
      setMessage('密码长度需为 8–256 个字符。')
      return
    }
    if (registerPasswordValue !== registerPasswordConfirm) {
      setMessage('两次输入的密码不一致。')
      return
    }
    setBusy('password-register')
    setMessage('')
    try {
      const session = await registerPassword(name, registerPasswordValue)
      setSession(session)
      setRegisterPasswordValue('')
      setRegisterPasswordConfirm('')
      setHasToken(true)
      void loadProfile()
      await Taro.showToast({ title: '注册成功', icon: 'success' })
    } catch (cause) {
      setMessage(authError(cause))
    } finally {
      setBusy('')
    }
  }

  async function runLink() {
    if (!linkCode.trim() || !ensureAuthConsent()) return
    setBusy('link')
    setMessage('')
    try {
      const result = await Taro.login()
      const session = await linkWechatMini(result.code, linkCode.trim().toUpperCase())
      setSession(session)
      setHasToken(true)
      void loadProfile()
      await Taro.showToast({ title: '绑定成功', icon: 'success' })
    } catch (cause) {
      setMessage(authError(cause))
    } finally {
      setBusy('')
    }
  }

  async function redeem() {
    const token = getAccessToken()
    const code = normalizeRedeemCode(redeemCode)
    if (!token || !code || busy) return
    setBusy('redeem')
    setMessage('')
    try {
      const result = await redeemCardCode(token, code)
      setEntitlement(result.entitlement)
      setGrantHistory((current) => [result.grant, ...current.filter((grant) => grant.id !== result.grant.id)])
      setRedeemCode('')
      await Taro.showToast({ title: '兑换成功', icon: 'success' })
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : '卡密兑换失败，请稍后重试。')
    } finally {
      setBusy('')
    }
  }

  async function loadMoreGrants() {
    const token = getAccessToken()
    if (!token || !grantCursor || busy) return
    setBusy('grants')
    try {
      const history = await listMyEntitlementGrants(token, { limit: 10, cursor: grantCursor })
      setGrantHistory((current) => [...current, ...history.items.filter((item) => !current.some((grant) => grant.id === item.id))])
      setGrantCursor(history.next_cursor ?? null)
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : '兑换记录加载失败，请稍后重试。')
    } finally {
      setBusy('')
    }
  }

  async function loadMoreNotifications() {
    const token = getAccessToken()
    if (!token || !notificationCursor || busy) return
    setBusy('notifications-more')
    try {
      const page = await listNotifications(token, { limit: 20, cursor: notificationCursor })
      setNotifications((current) => [...current, ...page.items.filter((item) => !current.some((existing) => existing.id === item.id))])
      setNotificationCursor(page.next_cursor ?? null)
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : '通知加载失败，请稍后重试。')
    } finally {
      setBusy('')
    }
  }

  async function toggleWechatNotifications() {
    const token = getAccessToken()
    if (!token || busy) return
    setBusy('notifications')
    setMessage('')
    try {
      if (!wechatNotificationsEnabled) {
        if (!notificationTemplateId) {
          setMessage('小程序尚未配置通知模板，请联系管理员。')
          return
        }
        if (typeof requestWechatSubscribe !== 'function') {
          setMessage('微信服务通知需在微信小程序中授权，H5 端可继续使用站内通知。')
          return
        }
        const result = await requestWechatSubscribe({ tmplIds: [notificationTemplateId] })
        if (result[notificationTemplateId] !== 'accept' && result[notificationTemplateId] !== 'acceptWithAudio') {
          setMessage('你未授权微信服务通知，站内通知仍会保留。')
          return
        }
      }
      const preferences = await updateNotificationPreferences(token, !wechatNotificationsEnabled)
      setWechatNotificationsEnabled(preferences.wechat_enabled)
      await Taro.showToast({ title: preferences.wechat_enabled ? '已开启通知' : '已关闭通知', icon: 'success' })
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : '通知设置失败，请稍后重试。')
    } finally {
      setBusy('')
    }
  }

  async function markRead(notificationId: string) {
    const token = getAccessToken()
    if (!token || busy) return
    setBusy(`read:${notificationId}`)
    try {
      await markNotificationRead(token, notificationId)
      setNotifications((current) => current.map((item) => item.id === notificationId ? { ...item, read_at: new Date().toISOString() } : item))
      setUnreadCount((current) => Math.max(0, current - (notifications.find((item) => item.id === notificationId)?.read_at ? 0 : 1)))
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : '通知状态更新失败')
    } finally {
      setBusy('')
    }
  }

  async function markAllRead() {
    const token = getAccessToken()
    if (!token || busy || unreadCount === 0) return
    setBusy('read-all')
    try {
      await markAllNotificationsRead(token)
      const now = new Date().toISOString()
      setNotifications((current) => current.map((item) => ({ ...item, read_at: item.read_at ?? now })))
      setUnreadCount(0)
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : '通知状态更新失败')
    } finally {
      setBusy('')
    }
  }

  async function logout() {
    const token = getAccessToken()
    setBusy('logout')
    let message = '已安全退出登录'
    try {
      if (token) await logoutMini(token)
    } catch {
      message = '已清除本机登录态，但服务器会话撤销失败，请稍后重新登录。'
    }
    clearSession()
    setHasToken(false)
    setUser(null)
    setEntitlement(null)
    setGrantHistory([])
    setNotifications([])
    setUnreadCount(0)
    setNotificationCursor(null)
    setMessage(message)
    setScreen('overview')
    setBusy('')
  }

  if (!hasToken && onboardingStage === 'splash') return <SplashScreen />
  if (!hasToken && onboardingStage === 'welcome') return <WelcomeScreen onLogin={() => { Taro.setStorageSync(onboardingSeenKey, true); setAuthMode('login'); setOnboardingStage('auth') }} onRegister={() => { Taro.setStorageSync(onboardingSeenKey, true); setAuthMode('register'); setOnboardingStage('auth') }} />
  if (!hasToken) return <AuthGate mode={authMode} username={username} password={password} registerUsername={registerUsername} registerPassword={registerPasswordValue} registerPasswordConfirm={registerPasswordConfirm} termsAccepted={termsAccepted} linkCode={linkCode} busy={busy} message={message} onModeChange={setAuthMode} onUsernameChange={setUsername} onPasswordChange={setPassword} onRegisterUsernameChange={setRegisterUsername} onRegisterPasswordChange={setRegisterPasswordValue} onRegisterPasswordConfirmChange={setRegisterPasswordConfirm} onTermsChange={setTermsAccepted} onLinkCodeChange={setLinkCode} onPasswordLogin={() => void runPasswordLogin()} onPasswordRegister={() => void runPasswordRegister()} onLogin={() => void runWechatLogin()} onLink={() => void runLink()} onBack={() => setOnboardingStage('welcome')} />
  if (screen !== 'overview') return <View className="mini-page me-page"><MeTopbar title={screenTitle(screen)} onBack={() => setScreen('overview')} />{screen === 'entitlement' && <EntitlementScreen entitlement={entitlement} redeemCode={redeemCode} busy={busy} onRedeemCodeChange={setRedeemCode} onRedeem={() => void redeem()} onOpenHistory={() => setScreen('history')} />}{screen === 'history' && <GrantHistoryScreen grants={grantHistory} cursor={grantCursor} busy={busy} onLoadMore={() => void loadMoreGrants()} />}{screen === 'notifications' && <NotificationScreen notifications={notifications} cursor={notificationCursor} unreadCount={unreadCount} enabled={wechatNotificationsEnabled} busy={busy} onToggle={() => void toggleWechatNotifications()} onMarkRead={(id) => void markRead(id)} onMarkAll={() => void markAllRead()} onLoadMore={() => void loadMoreNotifications()} />}{screen === 'settings' && <SettingsScreen busy={busy} helpExpanded={helpExpanded} privacyExpanded={privacyExpanded} onHelp={() => setHelpExpanded((current) => !current)} onPrivacy={() => setPrivacyExpanded((current) => !current)} onLogout={() => void logout()} message={message} />}</View>

  return <View className="mini-page me-page"><View className="me-topbar"><Text className="me-page-title">我的</Text><Button className="me-more-button" onClick={() => setScreen('settings')}>•••</Button></View><View className="profile-card"><Image className="profile-avatar" src={profileAvatar} mode="aspectFill" /><View className="profile-copy"><Text className="profile-name">{user?.display_name || '小豆同学'} <Text className="profile-leaf">◆</Text></Text><Text className="profile-id">ID: {user?.id?.slice(0, 12) || 'keeper_user'}</Text><Text className="profile-note">保持专注，享受每一次连接</Text></View><Text className="me-chevron">›</Text></View><View className="entitlement-preview" onClick={() => setScreen('entitlement')}><View><Text className="entitlement-preview-label">当前权益</Text><Text className="entitlement-preview-plan">{entitlement?.plan_code || '未激活权益'}</Text><Text className="entitlement-preview-date">有效期至 {formatEntitlementDate(entitlement?.expires_at)}</Text></View><Image className="mascot-small" src={mascotSprout} mode="aspectFit" /><View className="entitlement-progress"><View style={{ width: entitlement?.active ? '72%' : '12%' }} /></View></View><View className="me-action-grid"><MeAction icon="▣" title="权益与兑换" hint="查看权益与兑换卡密" onClick={() => setScreen('entitlement')} tone="green" /><MeAction icon="▤" title="兑换记录" hint="查看历史兑换记录" onClick={() => setScreen('history')} tone="blue" /><MeAction icon="♧" title="通知设置" hint={`${unreadCount ? `${unreadCount} 条未读` : '管理通知偏好'}`} onClick={() => setScreen('notifications')} tone="coral" /><MeAction icon="?" title="帮助中心" hint="使用说明与安全边界" onClick={() => setScreen('settings')} tone="purple" /><MeAction icon="⚙" title="设置" hint="通用设置与账号安全" onClick={() => setScreen('settings')} tone="teal" /><MeAction icon="i" title="关于我们" hint="了解 Douyin Keeper" onClick={() => setScreen('settings')} tone="amber" /></View><View className="me-feature-card"><View className="me-feature-heading"><Text className="me-feature-heading-title">已启用功能</Text><Text className="muted">权益范围内</Text></View><View className="feature-grid"><Feature label="会话火花" enabled /><Feature label="每日发送" enabled /><Feature label="风险提醒" enabled /><Feature label="安全暂停" enabled /></View></View>{message && <View className="me-inline-error"><Text>{message}</Text></View>}</View>
}

function SplashScreen() { return <View className="mini-page onboarding-page onboarding-splash"><View className="onboarding-logo"><Image className="onboarding-logo-image" src={authGuardian} mode="aspectFit" /></View><Text className="onboarding-brand">Douyin Keeper</Text><Text className="onboarding-tagline">轻量守护 · 稳定连接</Text><View className="onboarding-progress"><View className="onboarding-progress-value" /></View><Text className="onboarding-progress-label">正在初始化…</Text></View> }
function WelcomeScreen({ onLogin, onRegister }: { onLogin: () => void; onRegister: () => void }) { return <View className="mini-page onboarding-page onboarding-welcome"><View className="onboarding-page-indicator"><Text className="onboarding-indicator-active">1</Text><View /><Text>2</Text><View /><Text>3</Text></View><Image className="welcome-hero" src={authGuardian} mode="aspectFit" /><Text className="welcome-title">欢迎使用</Text><Text className="welcome-brand">Douyin <Text className="welcome-brand-accent">Keeper</Text></Text><Text className="welcome-copy">轻量守护，稳定连接{`\n`}让账号管理更安心</Text><View className="welcome-actions"><Button className="me-primary-button" onClick={onLogin}>登录</Button><Button className="me-secondary-button" onClick={onRegister}>注册</Button></View><View className="welcome-dots"><Text className="welcome-dot welcome-dot-active" /><Text className="welcome-dot" /><Text className="welcome-dot" /></View></View> }
function AuthGate({ mode, username, password, registerUsername, registerPassword, registerPasswordConfirm, termsAccepted, linkCode, busy, message, onModeChange, onUsernameChange, onPasswordChange, onRegisterUsernameChange, onRegisterPasswordChange, onRegisterPasswordConfirmChange, onTermsChange, onLinkCodeChange, onPasswordLogin, onPasswordRegister, onLogin, onLink, onBack }: { mode: AuthMode; username: string; password: string; registerUsername: string; registerPassword: string; registerPasswordConfirm: string; termsAccepted: boolean; linkCode: string; busy: string; message: string; onModeChange: (mode: AuthMode) => void; onUsernameChange: (value: string) => void; onPasswordChange: (value: string) => void; onRegisterUsernameChange: (value: string) => void; onRegisterPasswordChange: (value: string) => void; onRegisterPasswordConfirmChange: (value: string) => void; onTermsChange: (accepted: boolean) => void; onLinkCodeChange: (value: string) => void; onPasswordLogin: () => void; onPasswordRegister: () => void; onLogin: () => void; onLink: () => void; onBack: () => void }) { const isRegister = mode === 'register'; return <View className="mini-page me-page me-auth-page"><Button className="auth-back-button" onClick={onBack}>‹ 返回欢迎页</Button><Image className="auth-mascot" src={authGuardian} mode="aspectFit" /><Text className="auth-title">Douyin Keeper</Text><Text className="muted auth-subtitle">轻量守护，稳定连接</Text><View className="me-auth-card"><View className="auth-mode-tabs"><Button className={`auth-mode-tab ${!isRegister ? 'auth-mode-tab-active' : ''}`} onClick={() => onModeChange('login')}>登录</Button><Button className={`auth-mode-tab ${isRegister ? 'auth-mode-tab-active' : ''}`} onClick={() => onModeChange('register')}>注册</Button></View>{isRegister ? <><Text className="me-section-title">创建账号</Text><Text className="muted">注册后即可在 PC 端和小程序同步使用。</Text><Input className="me-code-input" value={registerUsername} maxlength={64} placeholder="请输入用户名（3–64 个字符）" onInput={(event) => onRegisterUsernameChange(event.detail.value)} /><Input className="me-code-input" value={registerPassword} maxlength={256} password placeholder="请输入密码（至少 8 个字符）" onInput={(event) => onRegisterPasswordChange(event.detail.value)} /><Input className="me-code-input" value={registerPasswordConfirm} maxlength={256} password placeholder="请再次输入密码" onInput={(event) => onRegisterPasswordConfirmChange(event.detail.value)} /><Button className="me-primary-button" disabled={busy !== '' || !registerUsername.trim() || !registerPassword || !registerPasswordConfirm || !termsAccepted} onClick={onPasswordRegister}>{busy === 'password-register' ? '注册中…' : '注册并登录'}</Button></> : <><Text className="me-section-title">账号密码登录</Text><Text className="muted">使用 PC 端账号登录，跨设备同步你的数据。</Text><Input className="me-code-input" value={username} maxlength={64} placeholder="请输入用户名" onInput={(event) => onUsernameChange(event.detail.value)} /><Input className="me-code-input" value={password} maxlength={256} password placeholder="请输入密码" onInput={(event) => onPasswordChange(event.detail.value)} /><Button className="me-primary-button" disabled={busy !== '' || !username.trim() || !password} onClick={onPasswordLogin}>{busy === 'password-login' ? '登录中…' : '登录'}</Button></>}</View><View className="auth-terms" onClick={() => onTermsChange(!termsAccepted)}><Checkbox value="terms" checked={termsAccepted} /><Text>我已阅读并同意</Text><Text className="auth-terms-link">《用户协议》</Text><Text>和</Text><Text className="auth-terms-link">《隐私政策》</Text></View><View className="me-auth-card me-auth-alternative"><Text className="me-section-title">微信快捷登录</Text><Text className="muted">已绑定过微信身份？无需输入密码即可登录。</Text><Button className="me-secondary-button" disabled={busy !== ''} onClick={onLogin}>{busy === 'login' ? '处理中…' : '微信登录'}</Button></View><View className="me-auth-card"><Text className="me-section-title">绑定 PC 账号</Text><Text className="muted">在 PC 端“我的”页面生成一次性绑定码。</Text><Input className="me-code-input" value={linkCode} maxlength={32} placeholder="例如 ABCD-EFGH" onInput={(event) => onLinkCodeChange(event.detail.value)} /><Button className="me-secondary-button" disabled={busy !== '' || !linkCode.trim()} onClick={onLink}>绑定已有账号</Button></View>{message && <View className="me-inline-error"><Text>{message}</Text></View>}</View> }
function MeTopbar({ title, onBack }: { title: string; onBack: () => void }) { return <View className="me-detail-topbar"><Button className="me-back-button" onClick={onBack}>‹</Button><Text>{title}</Text><View className="me-topbar-spacer" /></View> }
function EntitlementScreen({ entitlement, redeemCode, busy, onRedeemCodeChange, onRedeem, onOpenHistory }: { entitlement: Awaited<ReturnType<typeof myEntitlement>> | null; redeemCode: string; busy: string; onRedeemCodeChange: (value: string) => void; onRedeem: () => void; onOpenHistory: () => void }) { return <View><View className="entitlement-hero"><Text className="entitlement-hero-label">当前权益 ♛</Text><Text className="entitlement-hero-plan">{entitlement?.plan_code || '未激活'}</Text><Text className="entitlement-hero-date">有效期至 {formatEntitlementDate(entitlement?.expires_at)}</Text><Image className="mascot-entitlement" src={mascotSprout} mode="aspectFit" /><Text className="entitlement-remaining">剩余 {entitlement?.active ? Math.max(0, Math.ceil((new Date(entitlement.expires_at || Date.now()).getTime() - Date.now()) / 86400000)) : 0} 天</Text></View><View className="me-panel"><Text className="me-section-title">额度概览</Text><View className="quota-grid-me"><Quota label="账号槽位" value={quotaLabel(entitlement?.usage?.accounts_used, entitlement?.account_quota)} /><Quota label="任务额度" value={quotaLabel(entitlement?.usage?.tasks_used, entitlement?.task_quota)} /><Quota label="今日已用" value={quotaLabel(entitlement?.usage?.daily_send_reserved, entitlement?.daily_send_quota)} /></View></View><View className="me-panel"><View className="me-panel-heading"><Text className="me-section-title">兑换卡密</Text><Button className="me-link-button" onClick={onOpenHistory}>查看记录 ›</Button></View><Input className="me-code-input" value={redeemCode} maxlength={128} placeholder="请输入兑换码（区分大小写）" onInput={(event) => onRedeemCodeChange(event.detail.value)} /><Button className="me-primary-button" disabled={busy !== '' || !redeemCode.trim()} onClick={onRedeem}>{busy === 'redeem' ? '兑换中…' : '立即兑换'}</Button></View><View className="me-panel enabled-features"><Text className="me-section-title">已启用功能</Text><View className="feature-grid"><Feature label="会话火花" enabled /><Feature label="每日发送" enabled /><Feature label="风险提醒" enabled /></View></View></View> }
function GrantHistoryScreen({ grants, cursor, busy, onLoadMore }: { grants: Awaited<ReturnType<typeof listMyEntitlementGrants>>['items']; cursor: string | null; busy: string; onLoadMore: () => void }) { return <View className="me-panel history-panel"><View className="history-timeline">{grants.length === 0 ? <View className="me-empty"><Text className="me-empty-title">暂无兑换记录</Text><Text className="muted">兑换成功后，会在这里保留记录。</Text></View> : grants.map((grant) => { const status = entitlementGrantStatus(grant); return <View className="grant-card-me" key={grant.id}><View className="grant-dot" /><View className="grant-card-main"><View className="grant-card-heading"><Text className="grant-card-plan">{grant.plan_code || '未命名方案'} · {daysBetween(grant.starts_at, grant.expires_at)}天</Text><Text className={`grant-status grant-status-${status.tone}`}>{status.label}</Text></View><Text className="muted">兑换时间 {formatEntitlementDate(grant.starts_at)}</Text><Text className="muted">有效期 {formatEntitlementDate(grant.starts_at)} ～ {formatEntitlementDate(grant.expires_at)}</Text><Text className="grant-source">{entitlementSourceLabel(grant.source_type)}</Text></View></View> })}</View>{cursor && <Button className="me-secondary-button" disabled={busy === 'grants'} onClick={onLoadMore}>{busy === 'grants' ? '加载中…' : '加载更多记录'}</Button>}</View> }
function NotificationScreen({ notifications, cursor, unreadCount, enabled, busy, onToggle, onMarkRead, onMarkAll, onLoadMore }: { notifications: Awaited<ReturnType<typeof listNotifications>>['items']; cursor: string | null; unreadCount: number; enabled: boolean; busy: string; onToggle: () => void; onMarkRead: (id: string) => void; onMarkAll: () => void; onLoadMore: () => void }) { return <View><View className="notification-hero"><View><Text className="notification-hero-title">及时通知，不错过重要信息</Text><Text className="muted">可根据需要开启微信服务通知。</Text></View><Image className="notification-hero-image" src={notificationBell} mode="aspectFit" /></View><View className="me-panel"><View className="me-panel-heading"><Text className="me-section-title">站内通知</Text><Text className="me-unread-label">{unreadCount ? `${unreadCount} 条未读` : '已全部读'}</Text></View><View className="notification-setting-row"><View><Text>站内消息通知</Text><Text className="muted">登录失效与任务风险会保留在这里</Text></View><Text className="notification-enabled">已开启</Text></View>{notifications.length === 0 ? <View className="me-empty"><Text className="me-empty-title">暂无通知</Text><Text className="muted">账号状态变化时，会在这里提醒你。</Text></View> : notifications.map((item) => <View className={`me-notification-row ${item.read_at ? '' : 'me-notification-unread'}`} key={item.id}><View className="me-notification-copy"><Text className="compact-notification-title">{item.title}</Text><Text className="muted">{item.body}</Text></View><View><Text className={`notification-priority notification-priority-${item.priority}`}>{notificationPriorityLabel(item.priority)}</Text>{!item.read_at && <Button className="me-read-button" disabled={busy !== ''} onClick={() => onMarkRead(item.id)}>{busy === `read:${item.id}` ? '处理中…' : '已读'}</Button>}</View></View>)}{cursor && <Button className="me-link-button" disabled={busy !== ''} onClick={onLoadMore}>{busy === 'notifications-more' ? '加载中…' : '加载更多通知'}</Button>}{unreadCount > 0 && <Button className="me-link-button mark-all-button" disabled={busy !== ''} onClick={onMarkAll}>{busy === 'read-all' ? '处理中…' : '全部标为已读'}</Button>}</View><View className="me-panel"><View className="me-panel-heading"><Text className="me-section-title">微信通知</Text><Text className={`me-switch ${enabled ? 'me-switch-on' : ''}`} onClick={onToggle}>{enabled ? '开' : '关'}</Text></View><Text className="muted">授权后，登录失效和安全验证会通过微信提醒；站内通知始终保留。</Text><Button className="me-secondary-button" disabled={busy === 'notifications'} onClick={onToggle}>{busy === 'notifications' ? '处理中…' : enabled ? '关闭微信通知' : '开启微信通知'}</Button></View></View> }
function SettingsScreen({ busy, helpExpanded, privacyExpanded, onHelp, onPrivacy, onLogout, message }: { busy: string; helpExpanded: boolean; privacyExpanded: boolean; onHelp: () => void; onPrivacy: () => void; onLogout: () => void; message: string }) { return <View><SettingGroup title="账号与安全"><SettingRow title="账号与安全" hint="修改密码、登录设备管理" /><SettingRow title="清理缓存" hint="本地临时数据" trailing="—" /></SettingGroup><SettingGroup title="帮助与支持"><SettingRow title="联系客服" hint="工作日 9:00–18:00" /><Button className="setting-toggle-row" onClick={onHelp}><Text>常见问题</Text><Text>›</Text></Button><Button className="setting-toggle-row" onClick={onPrivacy}><Text>使用帮助与安全边界</Text><Text>›</Text></Button>{helpExpanded && <HelpList sections={helpSections} />}{privacyExpanded && <HelpList sections={privacySections} />}</SettingGroup><SettingGroup title="关于我们"><SettingRow title="关于 Douyin Keeper" hint="关系维护优先于营销扩张" /><SettingRow title="版本信息" hint="当前小程序版本" trailing="v1.0.0" /></SettingGroup>{message && <View className="me-inline-error"><Text>{message}</Text></View>}<Button className="me-logout-button" disabled={busy === 'logout'} onClick={onLogout}>{busy === 'logout' ? '退出中…' : '退出登录'}</Button></View> }
function SettingGroup({ title, children }: { title: string; children: ReactNode }) { return <View className="setting-group"><Text className="setting-group-title">{title}</Text><View className="setting-group-card">{children}</View></View> }
function SettingRow({ title, hint, trailing }: { title: string; hint: string; trailing?: string }) { return <View className="setting-row"><View><Text>{title}</Text><Text className="muted">{hint}</Text></View><Text className="setting-trailing">{trailing || '›'}</Text></View> }
function HelpList({ sections }: { sections: { title: string; body: string }[] }) { return <View className="help-list-me">{sections.map((section, index) => <View className={`help-row-me ${index === sections.length - 1 ? 'help-row-me-last' : ''}`} key={section.title}><Text className="help-row-me-title">{section.title}</Text><Text className="muted">{section.body}</Text></View>)}</View> }
function MeAction({ icon, title, hint, onClick, tone }: { icon: string; title: string; hint: string; onClick: () => void; tone: string }) { return <Button className="me-action" onClick={onClick}><Text className={`me-action-icon me-action-icon-${tone}`}>{icon}</Text><View><Text className="me-action-title">{title}</Text><Text className="muted">{hint}</Text></View></Button> }
function Feature({ label, enabled }: { label: string; enabled?: boolean }) { return <View className="feature-item"><Text className={`feature-dot ${enabled ? 'feature-dot-on' : ''}`}>✓</Text><Text>{label}</Text><Text className="feature-state">{enabled ? '已启用' : '待开启'}</Text></View> }
function Quota({ label, value }: { label: string; value: string }) { return <View className="quota-item-me"><Text className="quota-value-me">{value}</Text><Text className="muted">{label}</Text></View> }
function screenTitle(screen: MeScreen) { return { overview: '我的', entitlement: '权益与兑换', history: '兑换记录', notifications: '通知设置', settings: '设置' }[screen] }
function daysBetween(start: string, end: string) { return Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000)) }
function authError(cause: unknown) {
  if (cause instanceof MiniApiError) {
    if (cause.code === 'WECHAT_NOT_LINKED' || cause.code === 'WECHAT_IDENTITY_NOT_LINKED') return '微信身份尚未绑定，请先在 PC 端生成绑定码。'
    if (cause.code === 'INVALID_CREDENTIALS') return '用户名或密码错误。'
    if (cause.code === 'CONFLICT') return '用户名已存在，或账号信息冲突。'
  }
  return cause instanceof Error ? cause.message : '操作失败，请稍后重试。'
}
