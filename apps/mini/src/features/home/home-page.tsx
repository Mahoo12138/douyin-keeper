import { useCallback, useEffect, useState } from 'react'
import { Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'

import { checkAccountSession, getJob, getMe, getSendJob, listAccounts, listNotifications, listSendIntents, listTasks, MiniApiError, runTaskNow, syncAccountFriends } from '@/lib/api'
import { getAccessToken } from '@/lib/session'
import { createIdempotencyKey, nextEnabledTask, selectAccountId } from '@/features/home/home-utils'
import { jobErrorMessage } from '@/features/job-error-utils'
import { notificationBodyLabel } from '@/features/notification/notification-utils'
import { openLoginPage, openMeNotifications } from '@/features/navigation/mini-navigation'
import { accountTabLabel } from '@/components/account-tab-utils'
import { MiniButton as Button } from '@/components/mini-button'
import { MiniNavbarAction, MiniPageLayout } from '@/components/mini-navbar'
import { MiniRemoteImage } from '@/components/mini-remote-image'
import { miniAssetUrl } from '@/lib/mini-assets'
import { productDayKey, productDayRange, PRODUCT_TIMEZONE } from '@/features/time/time-utils'

const avatarChen = miniAssetUrl('home/avatar-chen.png')
const avatarJasper = miniAssetUrl('home/avatar-jasper.png')
const avatarMiles = miniAssetUrl('home/avatar-miles.png')
type AccountRow = { id: string; name: string; subtitle: string; online: boolean; statusText: string; avatarSrc: string }
type Metric = { label: string; value: string | number; tone: 'green' | 'amber' | 'red' }
type RiskAlert = { id: string; tone: 'amber' | 'red'; icon: string; title: string; desc: string; action: string; target: 'accounts' | 'tasks' | 'notifications' | 'none' }
type RecentTask = { id: string; icon: string; tone: 'green' | 'red'; name: string; time: string; status: '成功' | '失败' | '执行中' }
type HomeView = {
  greetingName: string
  accounts: AccountRow[]
  tasks: Awaited<ReturnType<typeof listTasks>>['items']
  activeAccountId: string
  metrics: Metric[]
  riskAlerts: RiskAlert[]
  recentTasks: RecentTask[]
  unreadCount: number
}

type RealHomeSource = Awaited<ReturnType<typeof loadRealHome>>

async function loadRealHome() {
  const token = getAccessToken() as string
  const [user, accountsResponse, tasksResponse, historyResponse] = await Promise.all([
    getMe(token),
    listAccounts(token),
    listTasks(token),
    listSendIntents(token, productDayRange(productDayKey())),
  ])
  const notificationsResponse = await listNotifications(token, { limit: 3 }).catch(() => null)
  return { user, accounts: accountsResponse.items, tasks: tasksResponse.items, history: historyResponse.items, notifications: notificationsResponse?.items ?? [], unreadCount: notificationsResponse?.unread_count ?? 0 }
}

function realView(source: RealHomeSource): HomeView {
  const { accounts, tasks, history } = source
  const rows: AccountRow[] = accounts.map((account) => {
    const online = account.binding_status === 'bound' && account.session_status === 'valid'
    const statusText = !online
      ? account.binding_status !== 'bound' ? '未绑定 · 暂不可用' : '登录态异常 · 需要处理'
      : account.risk_status === 'paused' ? '已暂停 · 风险保护' : account.risk_status === 'cooling_down' ? '风险冷却中 · 已自动暂停' : '状态正常 · 运行中'
    return {
      id: account.id,
      name: accountTabLabel(account),
      subtitle: `${account.friend_count} 位好友 · ${account.enabled_task_count} 项任务`,
      online,
      statusText,
      avatarSrc: account.avatar_url || fallbackAvatar(accountTabLabel(account)),
    }
  })
  const accountAlerts: RiskAlert[] = accounts.flatMap((account) => {
    const alerts: RiskAlert[] = []
    if (account.binding_status === 'bound' && account.session_status !== 'valid') {
      const title = account.session_status === 'challenge_required' ? '需要安全验证' : account.session_status === 'expired' ? 'Session 失效' : '登录态待检查'
      const desc = account.session_status === 'challenge_required' ? `${accountTabLabel(account)} · 需要人工完成验证` : account.session_status === 'expired' ? `${accountTabLabel(account)} · 登录态已过期` : `${accountTabLabel(account)} · 请重新检查登录态`
      alerts.push({ id: `${account.id}-session`, tone: 'amber', icon: '!', title, desc, action: '去处理', target: 'accounts' })
    }
    if (account.risk_status === 'cooling_down') {
      alerts.push({ id: `${account.id}-cooldown`, tone: 'red', icon: '✕', title: '风险冷却中', desc: `${accountTabLabel(account)} · 平台风控限制`, action: '去查看', target: 'accounts' })
    }
    if (account.risk_status === 'paused') {
      alerts.push({ id: `${account.id}-paused`, tone: 'amber', icon: '!', title: '账号已暂停', desc: `${accountTabLabel(account)} · 风险保护已暂停任务`, action: '去查看', target: 'accounts' })
    }
    return alerts
  })
  const notificationAlerts: RiskAlert[] = source.notifications.slice(0, 3).map((notification) => ({
    id: notification.id,
    tone: notification.priority === 'critical' ? 'red' : 'amber',
    icon: notification.priority === 'critical' ? '✕' : '!',
    title: notification.title,
    desc: notificationBodyLabel(notification.body),
    action: '查看通知',
    target: 'notifications',
  }))
  // Prefer the same recent notification feed rendered by the PC dashboard;
  // account-derived alerts remain a fallback when the feed is unavailable.
  const riskAlerts = [...notificationAlerts, ...accountAlerts].slice(0, 3)
  const succeeded = history.filter((item) => item.status === 'succeeded').length
  const validAccounts = accounts.filter((account) => account.binding_status === 'bound' && account.session_status === 'valid').length
  const enabledTasks = tasks.filter((task) => task.enabled).length
  return {
    greetingName: source.user.display_name || '火花助手',
    accounts: rows,
    tasks,
    activeAccountId: selectAccountId(accounts),
    // Keep the mini-program overview on the same business definitions as the
    // PC dashboard. The layout remains mobile-specific, but users should see
    // the same four numbers regardless of which client they open.
    metrics: [
      { label: '有效账号', value: `${validAccounts} / ${accounts.filter((account) => account.binding_status === 'bound').length}`, tone: validAccounts > 0 ? 'green' : 'amber' },
      { label: '今日发送', value: succeeded, tone: 'green' },
      { label: '启用任务', value: `${enabledTasks} / ${tasks.length}`, tone: enabledTasks > 0 ? 'green' : 'amber' },
      { label: '未读通知', value: source.unreadCount, tone: source.unreadCount > 0 ? 'red' : 'green' },
    ],
    riskAlerts,
    recentTasks: history.slice(0, 3).map((item) => ({
      id: item.id,
      icon: '↯',
      tone: item.status === 'failed' || item.status === 'cancelled' ? 'red' : 'green',
      name: item.friend.display_name,
      time: formatClock(item.scheduled_at),
      status: item.status === 'succeeded' ? '成功' : ['pending', 'queued', 'running', 'retry_wait'].includes(item.status) ? '执行中' : '失败',
    })),
    unreadCount: source.unreadCount,
  }
}

export function HomePage() {
  const [state, setState] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading')
  const [view, setView] = useState<HomeView | null>(null)
  const [error, setError] = useState('')
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const [homeJob, setHomeJob] = useState<{ id: string; action: 'sync' | 'run' | 'session' } | null>(null)
  const [homeJobStatus, setHomeJobStatus] = useState('')
  const [busyAction, setBusyAction] = useState<'sync' | 'run' | 'session' | ''>('')

  // 弹层是 fixed 覆盖层，原生 tabBar 会盖住底部操作，打开时先收起。
  const openSwitcher = useCallback(() => {
    setSwitcherOpen(true)
    void Taro.hideTabBar({ animation: false })
  }, [])
  const closeSwitcher = useCallback(() => {
    setSwitcherOpen(false)
    void Taro.showTabBar({ animation: false })
  }, [])

  const load = useCallback(async () => {
    setState('loading')
    setError('')
    const token = getAccessToken()
    if (!token) {
      openLoginPage()
      return
    }
    try {
      const source = await loadRealHome()
      setView(realView(source))
      setSelectedAccountId('')
      setState(source.accounts.length === 0 ? 'empty' : 'ready')
    } catch (cause) {
      if (cause instanceof MiniApiError && cause.statusCode === 401) {
        openLoginPage()
        return
      }
      setError(cause instanceof Error ? cause.message : '首页数据加载失败')
      setState('error')
    }
  }, [])

  useDidShow(() => {
    void Taro.showTabBar({ animation: false })
    if (!getAccessToken()) {
      openLoginPage()
      return
    }
    void load()
  })

  useEffect(() => {
    if (!homeJob) return
    const token = getAccessToken()
    if (!token) {
      setHomeJob(null)
      setHomeJobStatus('')
      setBusyAction('')
      return
    }
    let active = true
    const poll = async () => {
      try {
        const job = homeJob.action === 'run' ? await getSendJob(token, homeJob.id) : await getJob(token, homeJob.id)
        if (!active) return
        setHomeJobStatus(homeJobStatusLabel(job.status))
        if (!['succeeded', 'failed', 'cancelled'].includes(job.status)) return
        setHomeJob(null)
        setHomeJobStatus('')
        setBusyAction('')
        if (job.status === 'succeeded') {
          await load()
          if (active) await Taro.showToast({ title: homeJob.action === 'run' ? '任务执行完成' : homeJob.action === 'sync' ? '会话同步完成' : '登录态检查完成', icon: 'success' })
        } else if (active) {
          setError(jobErrorMessage(job.error_code, homeJob.action === 'run' ? '任务执行失败，请查看执行记录。' : homeJob.action === 'sync' ? '会话同步失败，请重试。' : '登录态检查失败，请重试。'))
        }
      } catch (cause) {
        if (!active) return
        setHomeJob(null)
        setHomeJobStatus('')
        setBusyAction('')
        setError(cause instanceof Error ? cause.message : '后台任务状态查询失败')
      }
    }
    void poll()
    const timer = setInterval(() => void poll(), 2500)
    return () => { active = false; clearInterval(timer) }
  }, [homeJob, load])

  if (state === 'loading') return <LoadingHome />
  if (state === 'empty') return <EmptyHome />
  if (state === 'error' || !view) return <ErrorHome message={error} onRetry={() => void load()} />

  const activeAccount = view.accounts.find((item) => item.id === (selectedAccountId || view.activeAccountId)) ?? view.accounts[0]
  const nextTask = activeAccount ? nextEnabledTask(view.tasks, activeAccount.id) : undefined

  function openAlertTarget(target: RiskAlert['target']) {
    if (target === 'accounts') void Taro.switchTab({ url: '/pages/accounts/index' })
    else if (target === 'tasks') void Taro.switchTab({ url: '/pages/tasks/index' })
    else if (target === 'notifications') openMeNotifications()
    else void Taro.showToast({ title: '该能力将在后续版本开放', icon: 'none' })
  }

  function openQuickEntry(entry: 'sync' | 'run' | 'tasks' | 'status') {
    if (entry === 'tasks') return void Taro.switchTab({ url: '/pages/tasks/index' })
    const token = getAccessToken()
    if (!token || !activeAccount || busyAction) return
    if (entry === 'status') {
      setBusyAction('session')
      setError('')
      void checkAccountSession(token, activeAccount.id, createIdempotencyKey()).then((result) => {
        setHomeJob({ id: result.job_id, action: 'session' })
        setHomeJobStatus(homeJobStatusLabel('queued'))
        void Taro.showToast({ title: '检查任务已提交', icon: 'success' })
      }).catch((cause) => {
        setBusyAction('')
        setError(cause instanceof Error ? cause.message : '登录态检查提交失败，请稍后重试。')
      })
      return
    }
    if (entry === 'sync') {
      setBusyAction('sync')
      setError('')
      void syncAccountFriends(token, activeAccount.id, createIdempotencyKey()).then((result) => {
        setHomeJob({ id: result.job_id, action: 'sync' })
        setHomeJobStatus(homeJobStatusLabel('queued'))
        void Taro.showToast({ title: '同步任务已提交', icon: 'success' })
      }).catch((cause) => {
        setBusyAction('')
        setError(cause instanceof Error ? cause.message : '会话同步提交失败，请稍后重试。')
      })
      return
    }
    if (!nextTask) {
      void Taro.showToast({ title: '当前账号暂无可执行任务', icon: 'none' })
      return
    }
    setBusyAction('run')
    setError('')
    void runTaskNow(token, nextTask.id, createIdempotencyKey()).then((result) => {
      setHomeJob({ id: result.job_id, action: 'run' })
      setHomeJobStatus(homeJobStatusLabel(result.status))
      void Taro.showToast({ title: '已加入发送队列', icon: 'success' })
    }).catch((cause) => {
      setBusyAction('')
      setError(cause instanceof Error ? cause.message : '立即执行失败，请稍后重试。')
    })
  }

  return <MiniPageLayout
    pageClassName="home-page"
    align="start"
    title={<Text className="home-brand">Douyin Keeper</Text>}
    action={<MiniNavbarAction className="home-notification-button" ariaLabel="通知" onClick={openMeNotifications}>
      <MiniRemoteImage className="home-bell" name="home/icon-bell.png" mode="aspectFit" />
      {view.unreadCount > 0 && <Text className="home-notification-badge">{Math.min(9, view.unreadCount)}</Text>}
    </MiniNavbarAction>}
  >

    {activeAccount && <View className="home-account-card home-reveal home-reveal-2" onClick={openSwitcher}>
      <View className="home-account-avatar"><MiniRemoteImage className="home-account-avatar-image" src={activeAccount.avatarSrc} mode="aspectFill" /></View>
      <View className="home-account-copy">
        <View className="home-account-name-row">
          <Text className="home-account-name">{activeAccount.name}</Text>
          <View className={`home-online-pill ${activeAccount.online ? 'home-online-pill-on' : 'home-online-pill-off'}`}><Text className="home-online-pill-dot" />{activeAccount.online ? '在线' : '离线'}</View>
        </View>
        <Text className="home-account-subtitle">{activeAccount.subtitle}</Text>
        <View className="home-account-status"><Text className={`home-account-status-dot ${activeAccount.online ? 'is-on' : 'is-off'}`} /><Text>{activeAccount.statusText}</Text></View>
      </View>
      <Text className="chevron" aria-hidden="true">›</Text>
    </View>}

      <View className="home-card home-reveal home-reveal-3">
      <View className="home-card-heading">
        <Text className="home-card-title">今日概览</Text>
        <Button className="home-card-link-button" onClick={() => void Taro.switchTab({ url: '/pages/tasks/index' })}>更多 ›</Button>
      </View>
      <View className="home-metrics">
        {view.metrics.map((metric) => <View className="home-metric" key={metric.label}>
          <Text className={`home-metric-value home-metric-value-${metric.tone}`}>{metric.value}</Text>
          <Text className="home-metric-label">{metric.label}</Text>
        </View>)}
      </View>
    </View>

    {homeJobStatus && <View className="home-operation-status"><Text>{homeJob?.action === 'run' ? '立即执行' : homeJob?.action === 'sync' ? '同步会话' : '登录态检查'}：{homeJobStatus}</Text></View>}

    {view.riskAlerts.length > 0 && <View className="home-card home-reveal home-reveal-4">
      <View className="home-card-heading">
        <Text className="home-card-title">风险提醒</Text>
        <Text className="home-risk-count">{view.riskAlerts.length} 条待处理</Text>
      </View>
      {view.riskAlerts.map((alert, index) => <View className={`home-risk-item ${index === view.riskAlerts.length - 1 ? 'home-row-last' : ''}`} key={alert.id}>
        <View className={`home-risk-icon home-risk-icon-${alert.tone}`}><Text>{alert.icon}</Text></View>
        <View className="home-risk-copy">
          <Text className="home-risk-title">{alert.title}</Text>
          <Text className="home-risk-desc">{alert.desc}</Text>
        </View>
        <Button className={`home-risk-action home-risk-action-${alert.tone}`} onClick={() => openAlertTarget(alert.target)}>{alert.action}</Button>
      </View>)}
    </View>}

    <View className="home-card home-reveal home-reveal-5">
      <View className="home-card-heading">
        <Text className="home-card-title">最近任务</Text>
        <Button className="home-card-link-button" onClick={() => void Taro.navigateTo({ url: '/pages/history/index' })}>查看全部 ›</Button>
      </View>
      {view.recentTasks.length === 0 ? <View className="home-card-empty"><Text className="muted">今天还没有执行记录，开启任务后会显示在这里。</Text></View>
        : view.recentTasks.map((task, index) => <View className={`home-recent-row ${index === view.recentTasks.length - 1 ? 'home-row-last' : ''}`} key={task.id}>
          <View className={`home-recent-icon ${task.tone === 'red' ? 'home-recent-icon-red' : 'home-recent-icon-green'}`}><Text>{task.icon}</Text></View>
          <View className="home-recent-copy">
            <Text className="home-recent-name">{task.name}</Text>
            <Text className="home-recent-time">{task.time}</Text>
          </View>
          <Text className={`home-recent-status home-recent-status-${task.status === '成功' ? 'success' : task.status === '失败' ? 'danger' : 'running'}`}>{task.status}</Text>
        </View>)}
    </View>

    <View className="home-card home-reveal home-reveal-6">
      <View className="home-card-heading"><Text className="home-card-title">快捷入口</Text></View>
      <View className="home-quick-grid">
        <Button className="home-quick-item" disabled={busyAction !== ''} onClick={() => openQuickEntry('sync')}><View className="home-quick-icon"><Text>⇄</Text></View><Text className="home-quick-label">同步会话</Text></Button>
        <Button className="home-quick-item" disabled={busyAction !== ''} onClick={() => openQuickEntry('run')}><View className="home-quick-icon"><Text>⚡</Text></View><Text className="home-quick-label">立即执行</Text></Button>
        <Button className="home-quick-item" onClick={() => openQuickEntry('tasks')}><View className="home-quick-icon"><Text>≡</Text></View><Text className="home-quick-label">任务列表</Text></Button>
        <Button className="home-quick-item" disabled={busyAction !== ''} onClick={() => openQuickEntry('status')}><View className="home-quick-icon"><Text>◎</Text></View><Text className="home-quick-label">账号状态</Text></Button>
      </View>
    </View>

    {switcherOpen && <View className="home-sheet-mask" onClick={closeSwitcher}>
      <View className="home-sheet" onClick={(event) => event.stopPropagation()}>
        <View className="home-sheet-heading">
          <Text className="home-sheet-title">切换账号</Text>
          <Button className="home-sheet-manage" onClick={() => { closeSwitcher(); void Taro.switchTab({ url: '/pages/accounts/index' }) }}>管理</Button>
        </View>
        <View className="home-sheet-list">
          {view.accounts.map((account) => <Button className={`home-sheet-row ${account.id === activeAccount?.id ? 'home-sheet-row-active' : ''}`} key={account.id} onClick={() => { setSelectedAccountId(account.id); closeSwitcher() }}>
            <View className="home-sheet-avatar"><MiniRemoteImage className="home-sheet-avatar-image" src={account.avatarSrc} mode="aspectFill" /></View>
            <View className="home-sheet-copy">
              <Text className="home-sheet-name">{account.name}</Text>
              <Text className="home-sheet-id">{account.subtitle}</Text>
            </View>
            {account.online
              ? <View className="home-sheet-state"><Text className="home-sheet-state-text home-sheet-state-on">在线</Text><Text className="home-sheet-check">✓</Text></View>
              : <View className="home-sheet-state"><Text className="home-sheet-state-text home-sheet-state-off">离线</Text><Text className="home-sheet-check home-sheet-check-off">✓</Text></View>}
          </Button>)}
        </View>
        <Button className="home-sheet-add" onClick={() => { closeSwitcher(); void Taro.switchTab({ url: '/pages/accounts/index' }) }}><Text className="home-sheet-add-icon">＋</Text>添加抖音账号</Button>
      </View>
    </View>}
  </MiniPageLayout>
}

function EmptyHome() {
  return <MiniPageLayout pageClassName="home-page home-empty-state" align="start" title={<Text className="home-brand">Douyin Keeper</Text>}>
    <View className="home-empty-illustration"><MiniRemoteImage className="home-empty-illustration-image" name="home/empty-gift-box.png" mode="aspectFit" /></View>
    <Text className="home-empty-title">还没有添加抖音账号</Text>
    <Text className="home-empty-copy">添加账号后，即可查看状态、管理任务{'\n'}与好友互动，开启高效管理之旅</Text>
    <Button className="home-primary-button" onClick={() => void Taro.switchTab({ url: '/pages/accounts/index' })}>添加抖音账号</Button>
  </MiniPageLayout>
}

function ErrorHome({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <MiniPageLayout pageClassName="home-page" align="start" title={<Text className="home-brand">Douyin Keeper</Text>}><View className="home-error-state"><Text className="home-error-title">首页暂时不可用</Text><Text className="muted">{message || '请检查网络连接后重试。'}</Text><Button className="home-secondary-button" onClick={onRetry}>重新加载</Button></View></MiniPageLayout>
}

function LoadingHome() {
  return <MiniPageLayout pageClassName="home-page" align="start" title={<View className="home-skeleton home-skeleton-header" />}><View className="home-skeleton home-skeleton-account" /><View className="home-skeleton home-skeleton-card" /><View className="home-skeleton home-skeleton-card" /></MiniPageLayout>
}

function fallbackAvatar(name: string) {
  const value = name.toLowerCase()
  if (value.includes('jasper') || name.includes('杰') || name.includes('雅')) return avatarJasper
  if (value.includes('chen') || name.includes('陈')) return avatarChen
  return avatarMiles
}

function formatClock(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { timeZone: PRODUCT_TIMEZONE, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(value))
}

function homeJobStatusLabel(value: string) {
  return value === 'queued' ? '排队中' : value === 'running' ? '执行中' : value === 'succeeded' ? '已完成' : value === 'failed' ? '执行失败' : value === 'cancelled' ? '已取消' : '处理中'
}
