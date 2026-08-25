import { useCallback, useEffect, useState } from 'react'
import { Button, Image, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'

import { checkAccountSession, getMe, listAccounts, listNotifications, listSendIntents, listTasks, markAllNotificationsRead, markNotificationRead, MiniApiError, runTaskNow } from '@/lib/api'
import { getAccessToken } from '@/lib/session'
import { createIdempotencyKey, nextEnabledTask, selectAccountId } from '@/features/home/home-utils'
import { notificationPriorityLabel } from '@/features/notification/notification-utils'
import avatarChen from '@/assets/home/avatar-chen.png'
import avatarJasper from '@/assets/home/avatar-jasper.png'
import avatarMiles from '@/assets/home/avatar-miles.png'
import bellIcon from '@/assets/home/icon-bell.png'
import emptyGiftBox from '@/assets/home/empty-gift-box.png'

type HomeData = {
  user: Awaited<ReturnType<typeof getMe>>
  accounts: Awaited<ReturnType<typeof listAccounts>>['items']
  tasks: Awaited<ReturnType<typeof listTasks>>['items']
  history: Awaited<ReturnType<typeof listSendIntents>>['items']
  notifications: Awaited<ReturnType<typeof listNotifications>>['items']
  unreadNotificationCount: number
  notificationsAvailable: boolean
}

export function HomePage() {
  const [state, setState] = useState<'loading' | 'guest' | 'ready' | 'error'>('loading')
  const [data, setData] = useState<HomeData | null>(null)
  const [error, setError] = useState('')
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [accountPickerOpen, setAccountPickerOpen] = useState(false)
  const [notificationBusy, setNotificationBusy] = useState<string | 'all' | null>(null)
  const [runBusy, setRunBusy] = useState(false)
  const [sessionCheckBusy, setSessionCheckBusy] = useState(false)

  const load = useCallback(async () => {
    const token = getAccessToken()
    if (!token) {
      setState('guest')
      return
    }
    setState('loading')
    setError('')
    try {
      const [user, accountsResponse, tasksResponse, historyResponse] = await Promise.all([
        getMe(token),
        listAccounts(token),
        listTasks(token),
        listSendIntents(token, todayRange()),
      ])
      const notificationsResponse = await listNotifications(token, { limit: 3 }).catch(() => null)
      setData({
        user,
        accounts: accountsResponse.items,
        tasks: tasksResponse.items,
        history: historyResponse.items,
        notifications: notificationsResponse?.items ?? [],
        unreadNotificationCount: notificationsResponse?.unread_count ?? 0,
        notificationsAvailable: notificationsResponse !== null,
      })
      setState('ready')
    } catch (cause) {
      if (cause instanceof MiniApiError && cause.statusCode === 401) {
        setData(null)
        setState('guest')
        return
      }
      setError(cause instanceof Error ? cause.message : '首页数据加载失败')
      setState('error')
    }
  }, [])

  useEffect(() => { void load() }, [load])

  if (state === 'loading') return <LoadingHome />
  if (state === 'guest') return <GuestHome />
  if (state === 'error' || !data) return <ErrorHome message={error} onRetry={() => void load()} />

  const activeAccountId = selectAccountId(data.accounts, selectedAccountId)
  const account = data.accounts.find((item) => item.id === activeAccountId)
  const nextTask = account ? nextEnabledTask(data.tasks, account.id) : undefined
  const todayStats = getTodayStats(data.history)
  const activeTaskCount = data.tasks.filter((task) => task.enabled).length
  const trend = buildTrend(data.history)

  async function markRead(notificationId: string) {
    const token = getAccessToken()
    if (!token || notificationBusy) return
    setNotificationBusy(notificationId)
    try {
      await markNotificationRead(token, notificationId)
      setData((current) => current ? {
        ...current,
        notifications: current.notifications.map((item) => item.id === notificationId ? { ...item, read_at: new Date().toISOString() } : item),
        unreadNotificationCount: Math.max(0, current.unreadNotificationCount - (current.notifications.find((item) => item.id === notificationId)?.read_at ? 0 : 1)),
      } : current)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '通知状态更新失败')
    } finally {
      setNotificationBusy(null)
    }
  }

  async function markAllRead() {
    const token = getAccessToken()
    if (!token || notificationBusy || !data || data.unreadNotificationCount === 0) return
    setNotificationBusy('all')
    try {
      await markAllNotificationsRead(token)
      const now = new Date().toISOString()
      setData((current) => current ? { ...current, notifications: current.notifications.map((item) => ({ ...item, read_at: item.read_at ?? now })), unreadNotificationCount: 0 } : current)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '通知状态更新失败')
    } finally {
      setNotificationBusy(null)
    }
  }

  async function runNextTask() {
    const token = getAccessToken()
    if (!token || !nextTask || runBusy) return
    setRunBusy(true)
    setError('')
    try {
      await runTaskNow(token, nextTask.id, createIdempotencyKey())
      await Taro.showToast({ title: '已加入发送队列', icon: 'success' })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '立即执行失败，请稍后重试。')
    } finally {
      setRunBusy(false)
    }
  }

  async function checkSession() {
    const token = getAccessToken()
    if (!token || !account || sessionCheckBusy) return
    setSessionCheckBusy(true)
    setError('')
    try {
      await checkAccountSession(token, account.id)
      await Taro.showToast({ title: '检查任务已提交', icon: 'success' })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '登录态检查提交失败，请稍后重试。')
    } finally {
      setSessionCheckBusy(false)
    }
  }

  return <View className="mini-page home-page">
    <View className="home-header">
      <View><Text className="home-brand">Douyin Keeper</Text><Text className="home-greeting">你好，{data.user.display_name || '火花助手'}</Text></View>
      <Button className="home-notification-button" onClick={() => Taro.switchTab({ url: '/pages/login/index' })}><Image className="home-bell" src={bellIcon} mode="aspectFit" />{data.unreadNotificationCount > 0 && <Text className="home-notification-badge">{Math.min(9, data.unreadNotificationCount)}</Text>}</Button>
    </View>

    <View className="account-selector" onClick={() => setAccountPickerOpen((current) => !current)}>
      <Avatar src={account?.avatar_url} name={account?.nickname || '未绑定账号'} size="large" />
      <View className="account-selector-copy"><Text className="account-selector-label">当前账号</Text><Text className="account-selector-name">{account?.nickname || '还没有绑定抖音账号'}</Text><Text className="account-selector-status"><StatusDot tone={account?.binding_status === 'bound' ? 'green' : 'amber'} />{account ? `${accountStatus(account.binding_status)} · ${sessionStatus(account.session_status)}` : '绑定后开始管理好友火花'}</Text></View>
      <Text className="chevron" aria-hidden="true">›</Text>
    </View>

    {accountPickerOpen && <View className="account-picker"><View className="account-picker-heading"><Text>切换账号</Text><Text className="account-picker-count">{data.accounts.length} 个账号</Text></View>{data.accounts.length === 0 ? <Text className="muted">暂未绑定账号</Text> : data.accounts.map((item) => <Button key={item.id} className={`account-picker-row ${item.id === activeAccountId ? 'account-picker-row-active' : ''}`} onClick={() => { setSelectedAccountId(item.id); setAccountPickerOpen(false) }}><Avatar src={item.avatar_url} name={item.nickname || '未命名'} /><View className="account-picker-copy"><Text>{item.nickname || '未命名账号'}</Text><Text className="muted">{accountStatus(item.binding_status)} · {sessionStatus(item.session_status)}</Text></View>{item.id === activeAccountId && <Text className="account-check">✓</Text>}</Button>)}<Button className="account-picker-add" onClick={() => Taro.switchTab({ url: '/pages/accounts/index' })}><Text className="plus">+</Text> 添加或管理账号</Button></View>}

    <View className="home-summary"><View className="summary-heading"><View><Text className="summary-title">今日概览</Text><Text className="summary-caption">数据实时更新</Text></View><Text className="summary-date">{formatToday()}</Text></View><View className="summary-grid"><SummaryMetric label="活跃账号" value={data.accounts.filter((item) => item.binding_status === 'bound').length} /><SummaryMetric label="活跃任务" value={activeTaskCount} /><SummaryMetric label="已完成" value={todayStats.successful} /><SummaryMetric label="待处理" value={todayStats.pending} /></View></View>

    {error && <View className="home-error"><Text>{error}</Text></View>}

    <View className="home-card trend-card"><View className="home-card-heading"><View><Text className="home-card-title">今日任务趋势</Text><Text className="home-card-subtitle">按发送记录统计</Text></View><Text className="home-card-link">{data.history.length} 条记录</Text></View><View className="trend-chart" aria-label="今日任务趋势图"><View className="trend-grid-lines"><View /><View /><View /><View /></View><View className="trend-bars">{trend.map((value, index) => <View className="trend-column" key={`${value.label}-${index}`}><View className="trend-bar-track"><View className={`trend-bar trend-bar-${value.tone}`} style={{ height: `${Math.max(8, value.height)}%` }} /></View><Text className="trend-label">{value.label}</Text></View>)}</View></View><View className="trend-legend"><Text><StatusDot tone="green" />已完成 {todayStats.successful}</Text><Text><StatusDot tone="blue" />进行中 {todayStats.pending}</Text><Text><StatusDot tone="amber" />异常 {todayStats.failed}</Text></View></View>

    <View className="home-card recent-card"><View className="home-card-heading"><Text className="home-card-title">最近任务</Text><Button className="home-card-link-button" onClick={() => Taro.navigateTo({ url: '/pages/history/index' })}>查看全部 ›</Button></View>{data.history.length === 0 ? <View className="home-empty"><Text className="home-empty-icon">＋</Text><Text className="home-empty-title">今天还没有执行记录</Text><Text className="muted">开启任务后，执行结果会显示在这里。</Text></View> : <View>{data.history.slice(0, 4).map((item) => <RecentTask key={item.id} item={item} />)}</View>}</View>

    <View className="home-card status-panel"><View className="home-card-heading"><Text className="home-card-title">系统状态</Text><Text className="running-state"><StatusDot tone="green" />全部正常</Text></View><View className="status-grid"><StatusItem label="数据服务" value="正常" tone="green" /><StatusItem label="任务服务" value={data.history.some((item) => item.status === 'running') ? '执行中' : '就绪'} tone="green" /><StatusItem label="账号会话" value={account ? sessionStatus(account.session_status) : '未绑定'} tone={account?.session_status === 'valid' ? 'green' : 'amber'} /></View>{account && <Button className="home-outline-button" disabled={sessionCheckBusy} onClick={() => void checkSession()}>{sessionCheckBusy ? '检查中…' : '重新检查当前账号'}</Button>}</View>

    <View className="home-quick-actions"><Button className="home-primary-button" disabled={!nextTask || runBusy} onClick={() => void runNextTask()}><Text className="quick-action-icon">↯</Text>{runBusy ? '加入中…' : nextTask ? '立即执行下一项' : '暂无可执行任务'}</Button><Button className="home-secondary-button" onClick={() => Taro.switchTab({ url: '/pages/tasks/index' })}>管理好友与任务</Button></View>

    {data.notifications.length > 0 && <View className="home-card notification-card compact-notification-card"><View className="home-card-heading"><Text className="home-card-title">风险提醒</Text><Button className="home-card-link-button" disabled={notificationBusy !== null} onClick={() => void markAllRead()}>{notificationBusy === 'all' ? '处理中…' : '全部已读'}</Button></View>{data.notifications.map((item) => <View className={`compact-notification ${item.read_at ? '' : 'compact-notification-unread'}`} key={item.id}><View className="compact-notification-copy"><Text className="compact-notification-title">{item.title}</Text><Text className="muted">{item.body}</Text></View><View><Text className={`notification-priority notification-priority-${item.priority}`}>{notificationPriorityLabel(item.priority)}</Text>{!item.read_at && <Button className="notification-read-button" disabled={notificationBusy !== null} onClick={() => void markRead(item.id)}>{notificationBusy === item.id ? '处理中…' : '已读'}</Button>}</View></View>)}</View>}
  </View>
}

function Avatar({ src, name, size = 'normal' }: { src?: string | null; name: string; size?: 'normal' | 'large' }) { const imageSrc = src || avatarAssetFor(name); return <View className={`avatar avatar-${size}`}><Image className="avatar-image" src={imageSrc} mode="aspectFill" /></View> }
function StatusDot({ tone }: { tone: 'green' | 'blue' | 'amber' }) { return <Text className={`status-dot-small status-dot-small-${tone}`} /> }
function SummaryMetric({ label, value }: { label: string; value: number }) { return <View className="summary-metric"><Text className="summary-metric-value">{value}</Text><Text className="summary-metric-label">{label}</Text></View> }
function RecentTask({ item }: { item: HomeData['history'][number] }) { const status = recentStatus(item.status); return <View className="recent-task"><Avatar name={item.friend.display_name} /><View className="recent-task-copy"><Text className="recent-task-name">{item.friend.display_name}</Text><Text className="muted">{item.account.nickname || '未命名账号'} · {formatTime(item.scheduled_at)}</Text></View><Text className={`recent-task-status recent-task-status-${status.tone}`}>{status.label}</Text><Text className="recent-task-time">{formatClock(item.scheduled_at)}</Text></View> }
function StatusItem({ label, value, tone }: { label: string; value: string; tone: 'green' | 'amber' }) { return <View className="status-item"><StatusDot tone={tone} /><View><Text className="status-item-label">{label}</Text><Text className="status-item-value">{value}</Text></View></View> }
function GuestHome() { return <View className="mini-page home-page guest-home"><View className="home-branding"><Text className="home-brand">Douyin Keeper</Text><Text className="home-greeting">管理你的火花关系</Text></View><View className="guest-illustration"><Image className="guest-illustration-image" src={emptyGiftBox} mode="aspectFit" /></View><Text className="guest-title">欢迎使用火花助手</Text><Text className="muted guest-copy">登录后查看账号、好友和今日任务状态。</Text><Button className="home-primary-button" onClick={() => Taro.switchTab({ url: '/pages/login/index' })}>登录 / 绑定 PC 账号</Button></View> }
function ErrorHome({ message, onRetry }: { message: string; onRetry: () => void }) { return <View className="mini-page home-page"><View className="home-error-state"><Text className="home-error-icon">!</Text><Text className="home-empty-title">首页暂时不可用</Text><Text className="muted">{message || '请检查网络连接后重试。'}</Text><Button className="home-secondary-button" onClick={onRetry}>重新加载</Button></View></View> }
function LoadingHome() { return <View className="mini-page home-page"><View className="home-skeleton home-skeleton-header" /><View className="home-skeleton home-skeleton-account" /><View className="home-skeleton home-skeleton-summary" /><View className="home-skeleton home-skeleton-card" /><View className="home-skeleton home-skeleton-card" /></View> }
function getTodayStats(items: HomeData['history']) { return { successful: items.filter((item) => item.status === 'succeeded').length, pending: items.filter((item) => ['pending', 'queued', 'running', 'retry_wait'].includes(item.status)).length, failed: items.filter((item) => ['failed', 'skipped', 'cancelled'].includes(item.status)).length } }
function buildTrend(items: HomeData['history']) { const slots = [0, 4, 8, 12, 16, 20]; const counts = slots.map((slot) => items.filter((item) => { const hour = new Date(item.scheduled_at).getHours(); return hour >= slot && hour < slot + 4 }).length); const max = Math.max(...counts, 1); return slots.map((slot, index) => ({ label: `${String(slot).padStart(2, '0')}:00`, height: (counts[index] / max) * 92, tone: index === 3 ? 'green' : index === 4 ? 'blue' : 'soft' })) }
function recentStatus(value: HomeData['history'][number]['status']) { if (value === 'succeeded') return { label: '已完成', tone: 'success' }; if (['pending', 'queued', 'running', 'retry_wait'].includes(value)) return { label: '执行中', tone: 'running' }; return { label: '待处理', tone: 'pending' } }
function todayRange() { const now = new Date(); return { from: new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString(), to: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString() } }
function formatToday() { return new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric' }).format(new Date()) }
function formatTime(value: string) { return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(new Date(value)) }
function formatClock(value: string) { return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(new Date(value)) }
function accountStatus(value: string) { return value === 'bound' ? '在线' : value === 'binding' ? '绑定中' : '未绑定' }
function sessionStatus(value: string) { return value === 'valid' ? '正常' : value === 'expired' ? '已过期' : value === 'challenge_required' ? '需验证' : '待检查' }
function avatarAssetFor(name: string) { const value = name.toLowerCase(); if (value.includes('jasper') || name.includes('杰') || name.includes('雅')) return avatarJasper; if (value.includes('chen') || name.includes('陈')) return avatarChen; return avatarMiles }
