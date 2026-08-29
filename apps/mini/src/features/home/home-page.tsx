import { useCallback, useState } from 'react'
import { Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'

import { getMe, listAccounts, listNotifications, listSendIntents, listTasks, MiniApiError } from '@/lib/api'
import { getAccessToken } from '@/lib/session'
import { selectAccountId } from '@/features/home/home-utils'
import { openLoginPage, openMeNotifications } from '@/features/navigation/mini-navigation'
import { accountTabLabel } from '@/components/account-tab-utils'
import { MiniButton as Button } from '@/components/mini-button'
import { MiniRemoteImage } from '@/components/mini-remote-image'
import { miniAssetUrl } from '@/lib/mini-assets'
import { productDayKey, productDayRange, PRODUCT_TIMEZONE } from '@/features/time/time-utils'
import {
  USE_MOCK_HOME,
  mockHomeAccounts,
  mockOverviewMetrics,
  mockRecentTasks,
  mockRiskAlerts,
  mockUnreadNotificationCount,
  mockUserDisplayName,
  type MockHomeAccount,
} from '@/features/home/home-mock'

const avatarChen = miniAssetUrl('home/avatar-chen.png')
const avatarJasper = miniAssetUrl('home/avatar-jasper.png')
const avatarMiles = miniAssetUrl('home/avatar-miles.png')
type AccountRow = { id: string; name: string; subtitle: string; online: boolean; statusText: string; avatarSrc: string }
type Metric = { label: string; value: number; tone: 'green' | 'amber' | 'red' }
type RiskAlert = { id: string; tone: 'amber' | 'red'; icon: string; title: string; desc: string; action: string; target: 'accounts' | 'tasks' | 'none' }
type RecentTask = { id: string; icon: string; tone: 'green' | 'red'; name: string; time: string; status: '成功' | '失败' | '执行中' }
type HomeView = {
  greetingName: string
  accounts: AccountRow[]
  activeAccountId: string
  metrics: Metric[]
  riskAlerts: RiskAlert[]
  recentTasks: RecentTask[]
  unreadCount: number
}

const AVATARS: Record<MockHomeAccount['avatar'], string> = { chen: 'home/avatar-chen.png', jasper: 'home/avatar-jasper.png', miles: 'home/avatar-miles.png' }

function mockView(): HomeView {
  const accounts = mockHomeAccounts.map((item) => ({
    id: item.id,
    name: item.name,
    subtitle: `抖音号：${item.douyinId}`,
    online: item.online,
    statusText: item.statusText,
    avatarSrc: AVATARS[item.avatar],
  }))
  return {
    greetingName: mockUserDisplayName,
    accounts,
    activeAccountId: accounts[0]?.id ?? '',
    metrics: [
      { label: '运行中任务', value: mockOverviewMetrics.runningTasks, tone: 'green' },
      { label: '待处理', value: mockOverviewMetrics.pending, tone: 'amber' },
      { label: '已完成', value: mockOverviewMetrics.completed, tone: 'green' },
      { label: '风险提醒', value: mockOverviewMetrics.riskCount, tone: 'red' },
    ],
    riskAlerts: mockRiskAlerts,
    recentTasks: mockRecentTasks,
    unreadCount: mockUnreadNotificationCount,
  }
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
  const notificationsResponse = await listNotifications(token, { limit: 1 }).catch(() => null)
  return { user, accounts: accountsResponse.items, tasks: tasksResponse.items, history: historyResponse.items, unreadCount: notificationsResponse?.unread_count ?? 0 }
}

function realView(source: RealHomeSource): HomeView {
  const { accounts, tasks, history } = source
  const rows: AccountRow[] = accounts.map((account) => {
    const online = account.binding_status === 'bound' && account.session_status === 'valid'
    const cooling = account.risk_status !== 'normal'
    const statusText = !online
      ? account.binding_status !== 'bound' ? '未绑定 · 暂不可用' : '登录态异常 · 需要处理'
      : cooling ? '风险冷却中 · 已自动暂停' : '状态正常 · 运行中'
    return {
      id: account.id,
      name: accountTabLabel(account),
      subtitle: `${account.friend_count} 位好友 · ${account.enabled_task_count} 项任务`,
      online,
      statusText,
      avatarSrc: account.avatar_url || fallbackAvatar(accountTabLabel(account)),
    }
  })
  const riskAlerts: RiskAlert[] = accounts.flatMap((account) => {
    const alerts: RiskAlert[] = []
    if (account.binding_status === 'bound' && account.session_status !== 'valid') {
      alerts.push({ id: `${account.id}-session`, tone: 'amber', icon: '!', title: 'Session 失效', desc: `${accountTabLabel(account)} · 登录态已过期`, action: '去处理', target: 'accounts' })
    }
    if (account.risk_status === 'cooling_down') {
      alerts.push({ id: `${account.id}-cooldown`, tone: 'red', icon: '✕', title: '风险冷却中', desc: `${accountTabLabel(account)} · 平台风控限制`, action: '去查看', target: 'accounts' })
    }
    return alerts
  })
  const succeeded = history.filter((item) => item.status === 'succeeded').length
  const pending = history.filter((item) => ['pending', 'queued', 'running', 'retry_wait'].includes(item.status)).length
  return {
    greetingName: source.user.display_name || '火花助手',
    accounts: rows,
    activeAccountId: selectAccountId(accounts),
    metrics: [
      { label: '运行中任务', value: tasks.filter((task) => task.enabled).length, tone: 'green' },
      { label: '待处理', value: pending, tone: 'amber' },
      { label: '已完成', value: succeeded, tone: 'green' },
      { label: '风险提醒', value: riskAlerts.length, tone: riskAlerts.length > 0 ? 'red' : 'green' },
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
    if (USE_MOCK_HOME) {
      setView(mockView())
      setSelectedAccountId('')
      setState('ready')
      return
    }
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
    if (!USE_MOCK_HOME && !getAccessToken()) {
      openLoginPage()
      return
    }
    void load()
  })

  if (state === 'loading') return <LoadingHome />
  if (state === 'empty') return <EmptyHome />
  if (state === 'error' || !view) return <ErrorHome message={error} onRetry={() => void load()} />

  const activeAccount = view.accounts.find((item) => item.id === (selectedAccountId || view.activeAccountId)) ?? view.accounts[0]

  function selectAccount(id: string) {
    setSelectedAccountId(id)
    closeSwitcher()
    void Taro.showToast({ title: '已切换演示账号', icon: 'none' })
  }

  function openAlertTarget(target: RiskAlert['target']) {
    if (target === 'accounts') void Taro.switchTab({ url: '/pages/accounts/index' })
    else if (target === 'tasks') void Taro.switchTab({ url: '/pages/tasks/index' })
    else void Taro.showToast({ title: '该能力将在后续版本开放', icon: 'none' })
  }

  function openQuickEntry(entry: 'sync' | 'run' | 'tasks' | 'status') {
    if (entry === 'tasks') return void Taro.switchTab({ url: '/pages/tasks/index' })
    if (entry === 'status') return void Taro.switchTab({ url: '/pages/accounts/index' })
    void Taro.showToast({ title: '该能力将在后续版本开放', icon: 'none' })
  }

  return <View className="mini-page home-page">
    <View className="home-header home-reveal home-reveal-1">
      <Text className="home-brand">Douyin Keeper</Text>
      <View className="home-header-actions">
        <Button className="home-more-button" onClick={openSwitcher}><Text className="home-more-dots">•••</Text></Button>
        <Button className="home-notification-button" onClick={openMeNotifications}>
          <MiniRemoteImage className="home-bell" name="home/icon-bell.png" mode="aspectFit" />
          {view.unreadCount > 0 && <Text className="home-notification-badge">{Math.min(9, view.unreadCount)}</Text>}
        </Button>
      </View>
    </View>

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
        <Button className="home-quick-item" onClick={() => openQuickEntry('sync')}><View className="home-quick-icon"><Text>⇄</Text></View><Text className="home-quick-label">同步好友</Text></Button>
        <Button className="home-quick-item" onClick={() => openQuickEntry('run')}><View className="home-quick-icon"><Text>⚡</Text></View><Text className="home-quick-label">立即执行</Text></Button>
        <Button className="home-quick-item" onClick={() => openQuickEntry('tasks')}><View className="home-quick-icon"><Text>≡</Text></View><Text className="home-quick-label">任务列表</Text></Button>
        <Button className="home-quick-item" onClick={() => openQuickEntry('status')}><View className="home-quick-icon"><Text>◎</Text></View><Text className="home-quick-label">账号状态</Text></Button>
      </View>
    </View>

    {switcherOpen && <View className="home-sheet-mask" onClick={closeSwitcher}>
      <View className="home-sheet" onClick={(event) => event.stopPropagation()}>
        <View className="home-sheet-heading">
          <Text className="home-sheet-title">切换账号</Text>
          <Button className="home-sheet-manage" onClick={() => { closeSwitcher(); void Taro.switchTab({ url: '/pages/accounts/index' }) }}>管理</Button>
        </View>
        <View className="home-sheet-list">
          {view.accounts.map((account) => <Button className={`home-sheet-row ${account.id === activeAccount?.id ? 'home-sheet-row-active' : ''}`} key={account.id} onClick={() => { if (USE_MOCK_HOME) selectAccount(account.id); else { setSelectedAccountId(account.id); closeSwitcher() } }}>
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
  </View>
}

function EmptyHome() {
  return <View className="mini-page home-page home-empty-state">
    <View className="home-header"><Text className="home-brand">Douyin Keeper</Text></View>
    <View className="home-empty-illustration"><MiniRemoteImage className="home-empty-illustration-image" name="home/empty-gift-box.png" mode="aspectFit" /></View>
    <Text className="home-empty-title">还没有添加抖音账号</Text>
    <Text className="home-empty-copy">添加账号后，即可查看状态、管理任务{'\n'}与好友互动，开启高效管理之旅</Text>
    <Button className="home-primary-button" onClick={() => void Taro.switchTab({ url: '/pages/accounts/index' })}>添加抖音账号</Button>
  </View>
}

function ErrorHome({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <View className="mini-page home-page"><View className="home-error-state"><Text className="home-error-title">首页暂时不可用</Text><Text className="muted">{message || '请检查网络连接后重试。'}</Text><Button className="home-secondary-button" onClick={onRetry}>重新加载</Button></View></View>
}

function LoadingHome() {
  return <View className="mini-page home-page"><View className="home-skeleton home-skeleton-header" /><View className="home-skeleton home-skeleton-account" /><View className="home-skeleton home-skeleton-card" /><View className="home-skeleton home-skeleton-card" /></View>
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
