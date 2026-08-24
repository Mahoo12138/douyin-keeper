import { useCallback, useEffect, useState } from 'react'
import { Button, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'

import { getMe, listAccounts, listNotifications, listSendIntents, listTasks, markAllNotificationsRead, markNotificationRead, MiniApiError } from '@/lib/api'
import { getAccessToken } from '@/lib/session'
import { notificationPriorityLabel, notificationReadLabel } from '@/features/notification/notification-utils'

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
  const [notificationBusy, setNotificationBusy] = useState<string | 'all' | null>(null)

  const load = useCallback(async () => {
    const token = getAccessToken()
    if (!token) {
      setState('guest')
      return
    }
    setState('loading')
    setError('')
    try {
      const [user, accountsResponse, tasksResponse, historyResponse] = await Promise.all([getMe(token), listAccounts(token), listTasks(token), listSendIntents(token, todayRange())])
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
        setState('guest')
        setData(null)
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

  const successful = data.history.filter((item) => item.status === 'succeeded').length
  const pending = data.history.filter((item) => ['pending', 'queued', 'running', 'retry_wait'].includes(item.status)).length
  const failed = data.history.filter((item) => ['failed', 'skipped', 'cancelled'].includes(item.status)).length
  const account = data.accounts[0]
  const nextTask = data.tasks.find((task) => task.enabled)

  async function markRead(notificationId: string) {
    const token = getAccessToken()
    if (!token || notificationBusy) return
    setNotificationBusy(notificationId)
    try {
      await markNotificationRead(token, notificationId)
      setData((current) => current ? { ...current, notifications: current.notifications.map((item) => item.id === notificationId ? { ...item, read_at: new Date().toISOString() } : item), unreadNotificationCount: Math.max(0, current.unreadNotificationCount - (current.notifications.find((item) => item.id === notificationId)?.read_at ? 0 : 1)) } : current)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '通知状态更新失败')
    } finally {
      setNotificationBusy(null)
    }
  }

  async function markAllRead() {
    const token = getAccessToken()
    if (!token || notificationBusy || data?.unreadNotificationCount === 0) return
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

  return <View className="mini-page"><View className="mini-hero card"><Text className="eyebrow">M4 · 移动控制台</Text><Text className="title mini-hero-title">晚上好，{data.user.display_name || '火花助手'}</Text><Text className="muted">今天的火花维护状态，一眼就能看到。</Text></View><View className="section-title"><Text>今日状态</Text><Text className="muted">{formatToday()}</Text></View><View className="metric-grid"><Metric label="已成功" value={successful} tone="success" /><Metric label="待处理" value={pending} tone="warning" /><Metric label="失败" value={failed} tone={failed ? 'danger' : 'neutral'} /></View><View className="card status-card"><View className="card-heading"><Text className="card-title">账号状态</Text><Text className={`status-dot ${account?.binding_status === 'bound' ? 'status-dot-success' : 'status-dot-warning'}`}>{account ? accountStatus(account.binding_status) : '未绑定'}</Text></View>{account ? <View><Text className="account-name">{account.nickname || '未命名账号'}</Text><Text className="muted">会话：{sessionStatus(account.session_status)} · 风险：{riskStatus(account.risk_status)}</Text></View> : <View><Text className="muted">绑定抖音账号后，才能开始维护好友火花。</Text><Button className="mini-button secondary-button" onClick={() => Taro.switchTab({ url: '/pages/login/index' })}>去绑定账号</Button></View>}</View><View className="card next-task-card"><View className="card-heading"><Text className="card-title">下一次任务</Text><Text className="muted">{nextTask ? '每日启用' : '暂无'}</Text></View>{nextTask ? <View><Text className="task-message">{nextTask.message.body || (nextTask.message.kind === 'sticker' ? '贴纸消息' : '未填写消息')}</Text><Text className="muted">{nextTask.window_start.slice(0, 5)}–{nextTask.window_end.slice(0, 5)} · {nextTask.timezone}</Text><Button className="mini-button primary-button" onClick={() => Taro.switchTab({ url: '/pages/spark/index' })}>前往火花</Button></View> : <Text className="muted">还没有启用中的任务配置。</Text>}</View><View className="card notification-card"><View className="card-heading"><Text className="card-title">风险提醒</Text><Text className={`status-dot ${data.unreadNotificationCount ? 'status-dot-warning' : 'status-dot-success'}`}>{data.unreadNotificationCount ? `${data.unreadNotificationCount} 条未读` : '暂无未读'}</Text></View>{!data.notificationsAvailable ? <Text className="muted">通知暂时不可用，不影响任务执行；可稍后重试首页。</Text> : data.notifications.length === 0 ? <Text className="muted">暂无风险通知。</Text> : <View>{data.notifications.map((item) => <View className={`notification-row ${item.read_at ? 'notification-row-read' : 'notification-row-unread'}`} key={item.id}><View className="notification-heading"><Text className="notification-title">{item.title}</Text><Text className={`notification-priority notification-priority-${item.priority}`}>{notificationPriorityLabel(item.priority)}</Text></View><Text className="muted notification-body">{item.body}</Text><View className="notification-footer"><Text className="muted">{formatTime(item.created_at)} · {notificationReadLabel(item.read_at)}</Text>{!item.read_at && <Button className="notification-read-button" disabled={notificationBusy !== null} onClick={() => void markRead(item.id)}>{notificationBusy === item.id ? '处理中…' : '标为已读'}</Button>}</View></View>)}</View>}{data.unreadNotificationCount > 0 && <Button className="mini-button secondary-button" disabled={notificationBusy !== null} onClick={() => void markAllRead()}>{notificationBusy === 'all' ? '处理中…' : '全部标为已读'}</Button>}</View></View>
}

function Metric({ label, value, tone }: { label: string; value: number; tone: 'success' | 'warning' | 'danger' | 'neutral' }) {
  return <View className={`metric metric-${tone}`}><Text className="metric-value">{value}</Text><Text className="metric-label">{label}</Text></View>
}

function GuestHome() {
  return <View className="mini-page"><View className="mini-hero card"><Text className="eyebrow">M4 · 移动控制台</Text><Text className="title mini-hero-title">抖音火花助手</Text><Text className="muted">登录后查看账号、任务和今日发送状态。</Text><Button className="mini-button primary-button" onClick={() => Taro.switchTab({ url: '/pages/login/index' })}>登录 / 绑定 PC 账号</Button></View></View>
}

function ErrorHome({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <View className="mini-page"><View className="card empty-card"><Text className="card-title">首页暂时不可用</Text><Text className="muted">{message || '请检查网络连接后重试。'}</Text><Button className="mini-button secondary-button" onClick={onRetry}>重新加载</Button></View></View>
}

function LoadingHome() {
  return <View className="mini-page"><View className="card loading-card"><View className="loading-line loading-line-wide" /><View className="loading-line" /><View className="loading-block" /></View><View className="metric-grid"><View className="loading-block metric-loading" /><View className="loading-block metric-loading" /><View className="loading-block metric-loading" /></View></View>
}

function todayRange() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString()
  return { from: start, to: end }
}

function formatToday() {
  return new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric' }).format(new Date())
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
}

function accountStatus(value: string) { return value === 'bound' ? '已绑定' : value === 'binding' ? '绑定中' : '未绑定' }
function sessionStatus(value: string) { return value === 'valid' ? '正常' : value === 'expired' ? '已过期' : value === 'challenge_required' ? '需验证' : '待检查' }
function riskStatus(value: string) { return value === 'normal' ? '正常' : value === 'paused' ? '已暂停' : '冷却中' }
