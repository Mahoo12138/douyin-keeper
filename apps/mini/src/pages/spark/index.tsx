import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Input, Picker, Switch, Text, Textarea, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'

import { getAccessToken } from '@/lib/session'
import { cancelJob, getJob, listAccounts, listFriends, listMessageTemplates, listTasks, MiniApiError, requestPlatformConversationArchive, setConversationArchived, syncAccountFriends, updateFriend, updateTask } from '@/lib/api'
import { accountTabLabel } from '@/components/account-tab-utils'
import { createIdempotencyKey, selectAccountId } from '@/features/home/home-utils'
import { jobErrorMessage } from '@/features/job-error-utils'
import { openLoginPage } from '@/features/navigation/mini-navigation'
import { replaceFriend, replaceTask, taskDraftError, taskForFriend, taskTimeInput, taskTimePayload, templatePickerIndex } from '@/features/spark/spark-utils'
import { MiniButton as Button } from '@/components/mini-button'
import { MiniPageLayout } from '@/components/mini-navbar'
import { MiniDialog } from '@/components/mini-dialog'
import { MiniRemoteImage } from '@/components/mini-remote-image'
import { MiniToast, useMiniToast } from '@/components/mini-toast'

import sparkMetricIcon from '@/assets/tabbar/spark-active.png'
import taskMetricIcon from '@/assets/tabbar/tasks-active.png'

type SparkData = {
  accounts: Awaited<ReturnType<typeof listAccounts>>['items']
  friends: Awaited<ReturnType<typeof listFriends>>['items']
  tasks: Awaited<ReturnType<typeof listTasks>>['items']
}

type MessageTemplate = Awaited<ReturnType<typeof listMessageTemplates>>['items'][number]
type TaskDraft = { windowStart: string; windowEnd: string; message: string; messageKind: 'text' | 'sticker' }
type PlatformArchiveJob = { id: string; conversationId: string; archived: boolean }
type ConversationSyncJob = { id: string; cancelable: boolean }
type ConversationFilter = 'all' | 'spark' | 'unconfigured' | 'archived'

const conversationFilters: Array<{ value: ConversationFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'spark', label: '已开火花' },
  { value: 'unconfigured', label: '未配置任务' },
  { value: 'archived', label: '已归档' },
]
const avatarAqua = 'conversations/avatar-aqua.png'
const avatarDoodle = 'conversations/avatar-doodle.png'
const avatarPink = 'conversations/avatar-pink.png'
const flameMetricIcon = 'conversations/icon-flame.png'
const searchIcon = 'conversations/icon-search.png'
const syncIcon = 'conversations/icon-sync.png'
const chevronIcon = 'conversations/icon-chevron.png'

export default function Spark() {
  const [state, setState] = useState<'loading' | 'guest' | 'empty' | 'ready' | 'error'>('loading')
  const [data, setData] = useState<SparkData | null>(null)
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const selectedAccountIdRef = useRef('')
  const [filter, setFilter] = useState<ConversationFilter>('all')
  const [searchValue, setSearchValue] = useState('')
  const [expandedConversationId, setExpandedConversationId] = useState('')
  const [busyKey, setBusyKey] = useState('')
  const [error, setError] = useState('')
  const [editingTaskId, setEditingTaskId] = useState('')
  const [taskDraft, setTaskDraft] = useState<TaskDraft | null>(null)
  const [templates, setTemplates] = useState<MessageTemplate[]>([])
  const [platformArchiveJob, setPlatformArchiveJob] = useState<PlatformArchiveJob | null>(null)
  const [platformArchiveStatus, setPlatformArchiveStatus] = useState('')
  const [conversationSyncJob, setConversationSyncJob] = useState<ConversationSyncJob | null>(null)
  const [conversationSyncStatus, setConversationSyncStatus] = useState('')
  const [platformArchiveTarget, setPlatformArchiveTarget] = useState<SparkData['friends'][number] | null>(null)
  const { toast, showToast, hideToast } = useMiniToast()

  const load = useCallback(async (accountId?: string) => {
    const token = getAccessToken()
    if (!token) {
      setState('guest')
      return
    }
    setState('loading')
    setError('')
    try {
      const accountsResponse = await listAccounts(token)
      const accounts = accountsResponse.items
      const nextAccountId = accountId || selectAccountId(accounts, selectedAccountIdRef.current)
      if (!nextAccountId) {
        setData({ accounts, friends: [], tasks: [] })
        setState('empty')
        return
      }
      const [friendsResponse, tasksResponse, templatesResponse] = await Promise.all([
        listFriends(token, nextAccountId, { includeArchived: true }),
        listTasks(token),
        listMessageTemplates(token, { limit: 100 }),
      ])
      selectedAccountIdRef.current = nextAccountId
      setSelectedAccountId(nextAccountId)
      setData({ accounts, friends: friendsResponse.items, tasks: tasksResponse.items })
      setTemplates(templatesResponse.items)
      setState('ready')
    } catch (cause) {
      if (cause instanceof MiniApiError && cause.statusCode === 401) {
        openLoginPage()
        setData(null)
        setState('guest')
        return
      }
      setError(cause instanceof Error ? cause.message : '火花列表加载失败')
      setState('error')
    }
  }, [])

  useDidShow(() => { void load() })

  useEffect(() => {
    if (!platformArchiveJob) return
    const token = getAccessToken()
    if (!token) {
      setPlatformArchiveJob(null)
      setPlatformArchiveStatus('')
      setBusyKey('')
      return
    }
    let active = true
    const poll = async () => {
      try {
        const job = await getJob(token, platformArchiveJob.id)
        if (!active) return
        setPlatformArchiveStatus(jobStatusLabel(job.status))
        if (!['succeeded', 'failed', 'cancelled'].includes(job.status)) return
        setPlatformArchiveJob(null)
        setBusyKey('')
        if (job.status === 'succeeded') {
          await load(selectedAccountIdRef.current)
          if (active) showToast(platformArchiveJob.archived ? '平台归档完成' : '平台恢复完成', 'success')
        } else if (active) {
          setError(jobErrorMessage(job.error_code, job.status === 'cancelled' ? '平台归档请求已取消' : '平台归档未完成，请重试。'))
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : '平台归档状态查询失败')
      }
    }
    void poll()
    const timer = setInterval(() => void poll(), 2500)
    return () => { active = false; clearInterval(timer) }
  }, [platformArchiveJob, load, showToast])

  useEffect(() => {
    if (!conversationSyncJob) return
    const token = getAccessToken()
    if (!token) {
      setConversationSyncJob(null)
      setConversationSyncStatus('')
      setBusyKey('')
      return
    }
    let active = true
    const poll = async () => {
      try {
        const job = await getJob(token, conversationSyncJob.id)
        if (!active) return
        if (conversationSyncJob.cancelable !== job.cancelable) {
          setConversationSyncJob((current) => current ? { ...current, cancelable: job.cancelable } : current)
        }
        setConversationSyncStatus(jobStatusLabel(job.status))
        if (!['succeeded', 'failed', 'cancelled'].includes(job.status)) return
        setConversationSyncJob(null)
        setBusyKey('')
        if (job.status === 'succeeded') {
          await load(selectedAccountIdRef.current)
          if (active) showToast('会话同步完成', 'success')
        } else if (active) {
          setError(jobErrorMessage(job.error_code, job.status === 'cancelled' ? '会话同步请求已取消' : '会话同步失败，请重试。'))
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : '会话同步状态查询失败')
      }
    }
    void poll()
    const timer = setInterval(() => void poll(), 2500)
    return () => { active = false; clearInterval(timer) }
  }, [conversationSyncJob, load, showToast])

  async function chooseAccount(accountId: string) {
    closeTaskEditor()
    setExpandedConversationId('')
    setSearchValue('')
    selectedAccountIdRef.current = accountId
    setSelectedAccountId(accountId)
    await load(accountId)
  }

  async function toggleFriend(friendId: string, enabled: boolean) {
    const token = getAccessToken()
    if (!token || !data) return
    const target = data.friends.find((friend) => friend.id === friendId)
    if (target?.spark_supported === false) {
      setError('该会话暂不支持火花维护。')
      return
    }
    setBusyKey(`friend:${friendId}`)
    setError('')
    try {
      const updated = await updateFriend(token, friendId, enabled)
      setData({ ...data, friends: replaceFriend(data.friends, updated) })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '会话开关更新失败')
    } finally {
      setBusyKey('')
    }
  }

  async function toggleTask(taskId: string, enabled: boolean) {
    const token = getAccessToken()
    if (!token || !data) return
    setBusyKey(`task:${taskId}`)
    setError('')
    try {
      const updated = await updateTask(token, taskId, { enabled })
      setData({ ...data, tasks: replaceTask(data.tasks, updated) })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '任务开关更新失败')
    } finally {
      setBusyKey('')
    }
  }

  async function toggleArchive(friend: SparkData['friends'][number]) {
    const token = getAccessToken()
    if (!token || !data || busyKey) return
    setBusyKey(`archive:${friend.conversation_id}`)
    setError('')
    try {
      await setConversationArchived(token, selectedAccountId, friend.conversation_id, !friend.archived)
      await load(selectedAccountId)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '会话归档状态更新失败')
    } finally {
      setBusyKey('')
    }
  }

  async function syncConversations() {
    const token = getAccessToken()
    const accountId = selectedAccountIdRef.current
    if (!token || !accountId || busyKey || conversationSyncJob) return
    const account = data?.accounts.find((item) => item.id === accountId)
    if (account?.binding_status !== 'bound') {
      setError('请先完成抖音账号绑定，再同步会话。')
      return
    }
    setBusyKey('conversation-sync')
    setError('')
    try {
      const job = await syncAccountFriends(token, accountId, createIdempotencyKey())
      setConversationSyncJob({ id: job.job_id, cancelable: false })
      setConversationSyncStatus('排队中')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '会话同步请求提交失败')
      setBusyKey('')
    }
  }

  async function cancelConversationSync() {
    const token = getAccessToken()
    if (!token || !conversationSyncJob || busyKey !== 'conversation-sync') return
    setBusyKey('conversation-sync-cancel')
    try {
      await cancelJob(token, conversationSyncJob.id)
      setConversationSyncJob(null)
      setConversationSyncStatus('')
      setError('')
      showToast('同步请求已取消', 'success')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '取消同步请求失败')
    } finally {
      setBusyKey('')
    }
  }

  function requestPlatformArchive(friend: SparkData['friends'][number]) {
    const token = getAccessToken()
    if (!token || !data || busyKey || platformArchiveJob) return
    setPlatformArchiveTarget(friend)
  }

  async function confirmPlatformArchive() {
    const friend = platformArchiveTarget
    const token = getAccessToken()
    if (!friend || !token) return
    setPlatformArchiveTarget(null)
    const archived = !friend.archived
    setBusyKey(`platform-archive:${friend.conversation_id}`)
    setError('')
    try {
      const job = await requestPlatformConversationArchive(token, selectedAccountId, friend.conversation_id, archived, createIdempotencyKey())
      setPlatformArchiveJob({ id: job.job_id, conversationId: friend.conversation_id, archived })
      setPlatformArchiveStatus('排队中')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '平台归档请求提交失败')
      setBusyKey('')
    }
  }

  async function cancelPlatformArchive() {
    const token = getAccessToken()
    if (!token || !platformArchiveJob || busyKey !== `platform-archive:${platformArchiveJob.conversationId}`) return
    setBusyKey('platform-archive-cancel')
    try {
      await cancelJob(token, platformArchiveJob.id)
      setPlatformArchiveJob(null)
      setPlatformArchiveStatus('')
      setError('')
      showToast('平台请求已取消', 'success')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '取消平台归档请求失败')
    } finally {
      setBusyKey('')
    }
  }

  function openTaskEditor(task: SparkData['tasks'][number]) {
    setEditingTaskId(task.id)
    setTaskDraft({ windowStart: taskTimeInput(task.window_start), windowEnd: taskTimeInput(task.window_end), message: task.message.body ?? '', messageKind: task.message.kind })
    setError('')
  }

  function closeTaskEditor() {
    setEditingTaskId('')
    setTaskDraft(null)
  }

  async function saveTask(task: SparkData['tasks'][number]) {
    const token = getAccessToken()
    if (!token || !data || !taskDraft || busyKey) return
    const validationError = taskDraftError(taskDraft.windowStart, taskDraft.windowEnd, taskDraft.message)
    if (validationError) {
      setError(validationError)
      return
    }
    setBusyKey(`task-save:${task.id}`)
    setError('')
    try {
      const updated = await updateTask(token, task.id, {
        window_start: taskTimePayload(taskDraft.windowStart),
        window_end: taskTimePayload(taskDraft.windowEnd),
        message: { kind: taskDraft.messageKind, body: taskDraft.message.trim() },
      })
      setData({ ...data, tasks: replaceTask(data.tasks, updated) })
      closeTaskEditor()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '任务设置保存失败')
    } finally {
      setBusyKey('')
    }
  }

  const selectedAccount = data?.accounts.find((account) => account.id === selectedAccountId)
  const visibleTasks = useMemo(
    () => data?.tasks.filter((task) => task.account_id === selectedAccountId) ?? [],
    [data?.tasks, selectedAccountId],
  )
  const visibleFriends = useMemo(() => {
    const friends = data?.friends ?? []
    const query = searchValue.trim().toLocaleLowerCase('zh-CN')
    const taskFriendIds = new Set(visibleTasks.map((task) => task.friend_id))
    return friends.filter((friend) => {
      if (filter === 'archived' ? !friend.archived : friend.archived) return false
      if (filter === 'spark' && !friend.spark_enabled) return false
      if (filter === 'unconfigured' && taskFriendIds.has(friend.id)) return false
      if (!query) return true
      return [friend.nickname, friend.display_name, friend.short_id]
        .filter(Boolean)
        .some((value) => value?.toLocaleLowerCase('zh-CN').includes(query))
    })
  }, [data?.friends, filter, searchValue, visibleTasks])
  const metrics = useMemo(() => {
    const friends = data?.friends ?? []
    return {
      total: friends.filter((friend) => !friend.archived).length,
      spark: friends.filter((friend) => !friend.archived && friend.spark_enabled).length,
      archived: friends.filter((friend) => friend.archived).length,
    }
  }, [data?.friends])
  const accountLabels = data?.accounts.map(accountTabLabel) ?? []
  const selectedAccountIndex = Math.max(0, data?.accounts.findIndex((account) => account.id === selectedAccountId) ?? 0)

  if (state === 'loading') return <LoadingSpark />
  if (state === 'guest') return <GuestSpark />
  if (state === 'error') return <ErrorSpark message={error} onRetry={() => void load(selectedAccountId)} />
  if (!data || state === 'empty') return <EmptySpark />

  return <MiniPageLayout
    pageClassName="spark-page"
    align="start"
    title={<View className="spark-page-heading"><Text className="spark-title">会话</Text><Text className="spark-subtitle">好友与群聊统一维护火花</Text></View>}
  >
    <View className="spark-account-card spark-reveal spark-reveal-1">
      <View className="spark-account-main">
        <View className="spark-account-avatar">
          <MiniRemoteImage className="spark-account-avatar-image" src={selectedAccount?.avatar_url || avatarAssetFor(selectedAccount ? accountTabLabel(selectedAccount) : '')} mode="aspectFill" />
        </View>
        <View className="spark-account-copy">
          <Text className="spark-account-name">{selectedAccount ? accountTabLabel(selectedAccount) : '选择账号'}</Text>
          <Text className="spark-account-state">{selectedAccount?.binding_status === 'bound' ? '当前账号' : '待完成绑定'}</Text>
        </View>
        <View className="spark-account-actions">
          <ConversationSyncControls busy={busyKey !== ''} active={conversationSyncJob !== null} cancelable={conversationSyncJob?.cancelable ?? false} available={selectedAccount?.binding_status === 'bound'} status={conversationSyncStatus} onSync={() => void syncConversations()} onCancel={() => void cancelConversationSync()} onBind={() => Taro.switchTab({ url: '/pages/accounts/index' })} />
          {data.accounts.length > 1 ? <Picker mode="selector" range={accountLabels} value={selectedAccountIndex} onChange={(event) => { const account = data.accounts[Number(event.detail.value)]; if (account) void chooseAccount(account.id) }}>
            <View className="spark-account-switch"><Text>切换账号</Text><MiniRemoteImage className="spark-account-chevron" src={chevronIcon} mode="aspectFit" /></View>
          </Picker> : <Button className="spark-account-switch" onClick={() => Taro.switchTab({ url: '/pages/accounts/index' })}>账号管理<MiniRemoteImage className="spark-account-chevron" src={chevronIcon} mode="aspectFit" /></Button>}
          <Text className="spark-last-sync">上次同步 {formatSyncTime(selectedAccount?.last_friend_sync_at)}</Text>
        </View>
      </View>
    </View>

    <View className="spark-metrics spark-reveal spark-reveal-2">
      <MetricCard label="会话总数" value={metrics.total} icon={sparkMetricIcon} tone="mint" />
      <MetricCard label="已开启火花" value={metrics.spark} icon={flameMetricIcon} tone="aqua" />
      <MetricCard label="已归档" value={metrics.archived} icon={taskMetricIcon} tone="blue" />
    </View>

    {error && <View className="spark-error"><Text className="spark-error-mark">!</Text><Text>{error}</Text></View>}

    <View className="spark-conversation-panel spark-reveal spark-reveal-3">
      <View className="spark-search-field">
        <MiniRemoteImage className="spark-search-icon" src={searchIcon} mode="aspectFit" />
        <Input value={searchValue} placeholder="昵称或群聊名称" confirmType="search" onInput={(event) => setSearchValue(event.detail.value)} />
        {searchValue && <Button className="spark-search-clear" aria-label="清空搜索" onClick={() => setSearchValue('')}>清除</Button>}
      </View>
      <View className="spark-filter-list">
        {conversationFilters.map((item) => <Button key={item.value} className={`spark-filter spark-filter-${item.value} ${filter === item.value ? 'spark-filter-active' : ''}`} onClick={() => { setFilter(item.value); setExpandedConversationId(''); closeTaskEditor() }}>{item.label}</Button>)}
      </View>
      {visibleFriends.length === 0 ? <View className="spark-empty-card">
        <MiniRemoteImage className="spark-empty-image" name="home/empty-gift-box.png" mode="aspectFit" />
        <Text className="spark-empty-title">{filter === 'archived' ? '暂无已归档会话' : searchValue ? '没有找到相关会话' : '还没有会话'}</Text>
        <Text className="muted">{filter === 'archived' ? '归档后的会话会显示在这里，可随时恢复。' : searchValue ? '换个昵称或群聊名称试试。' : '先完成账号绑定，再同步消息面板会话。'}</Text>
      </View> : <View className="spark-list">
        {visibleFriends.map((friend) => {
          const task = friend.conversation_type === 'direct' ? taskForFriend(visibleTasks, friend.id) : undefined
          const platformBusy = platformArchiveJob?.conversationId === friend.conversation_id
          const expanded = expandedConversationId === friend.conversation_id
          return <View className="spark-friend-group" key={`${friend.conversation_id}:${friend.id}`}>
            <FriendCard accountName={selectedAccount ? accountTabLabel(selectedAccount) : '当前账号'} friend={friend} task={task} templates={templates} busyKey={busyKey} editingTaskId={editingTaskId} taskDraft={taskDraft} expanded={expanded} onToggleExpanded={() => setExpandedConversationId(expanded ? '' : friend.conversation_id)} onFriendToggle={friend.conversation_type === 'direct' ? (enabled) => void toggleFriend(friend.id, enabled) : undefined} onTaskToggle={task ? (enabled) => void toggleTask(task.id, enabled) : undefined} onEditTask={task ? () => editingTaskId === task.id ? closeTaskEditor() : openTaskEditor(task) : undefined} onDraftChange={setTaskDraft} onSaveTask={task ? () => void saveTask(task) : undefined} onCancelTask={closeTaskEditor} onArchive={() => void toggleArchive(friend)} />
            {expanded && <PlatformArchiveControls archived={friend.archived} busy={busyKey !== ''} active={platformBusy} status={platformBusy ? platformArchiveStatus : ''} onRequest={() => void requestPlatformArchive(friend)} onCancel={() => void cancelPlatformArchive()} />}
          </View>
        })}
      </View>}
    </View>
    <MiniToast visible={toast !== null} message={toast?.message ?? ''} tone={toast?.tone} onClose={hideToast} />
    <MiniDialog open={platformArchiveTarget !== null} title={platformArchiveTarget?.archived ? '请求平台恢复？' : '请求平台归档？'} content="这会创建后台任务，请求抖音平台变更会话状态；平台最终结果以适配器确认事件为准。" tone="warning" confirmText={platformArchiveTarget?.archived ? '请求恢复' : '请求归档'} onCancel={() => setPlatformArchiveTarget(null)} onConfirm={() => void confirmPlatformArchive()} />
  </MiniPageLayout>
}

function MetricCard({ label, value, icon, tone }: { label: string; value: number; icon: string; tone: 'mint' | 'aqua' | 'blue' }) {
  return <View className="spark-metric-card">
    <View className={`spark-metric-icon spark-metric-icon-${tone}`}><MiniRemoteImage src={icon} mode="aspectFit" /></View>
    <View><Text className="spark-metric-label">{label}</Text><Text className="spark-metric-value">{value}</Text></View>
  </View>
}

function FriendCard({ accountName, friend, task, templates, busyKey, editingTaskId, taskDraft, expanded, onToggleExpanded, onFriendToggle, onTaskToggle, onEditTask, onDraftChange, onSaveTask, onCancelTask, onArchive }: { accountName: string; friend: SparkData['friends'][number]; task?: SparkData['tasks'][number]; templates: MessageTemplate[]; busyKey: string; editingTaskId: string; taskDraft: TaskDraft | null; expanded: boolean; onToggleExpanded: () => void; onFriendToggle?: (enabled: boolean) => void; onTaskToggle?: (enabled: boolean) => void; onEditTask?: () => void; onDraftChange: (draft: TaskDraft | null) => void; onSaveTask?: () => void; onCancelTask: () => void; onArchive: () => void }) {
  const friendBusy = busyKey === `friend:${friend.id}`
  const taskBusy = task ? busyKey === `task:${task.id}` : false
  const isGroup = friend.conversation_type === 'group'
  const identityLabel = isGroup ? '群聊会话' : friend.platform_identity_status === 'resolved' ? '身份已确认' : friend.platform_identity_status === 'pending' ? '身份待确认' : '需处理'
  const displayName = friend.nickname || friend.display_name || '未命名会话'
  const canManageSpark = Boolean(onFriendToggle) && !isGroup
  const fireTone = friend.streak_days > 0 ? 'warm' : 'cool'
  return <View className={`spark-conversation-card ${expanded ? 'spark-conversation-card-expanded' : ''}`}>
    <View className="spark-conversation-row" onClick={onToggleExpanded}>
      <View className="spark-identity">
        <View className="spark-avatar"><MiniRemoteImage className="spark-avatar-image" src={friend.avatar_url || avatarAssetFor(displayName)} mode="aspectFill" /></View>
        <View className="spark-identity-copy">
          <Text className="spark-card-title">{displayName}</Text>
          <Text className="spark-card-caption">{accountName}</Text>
        </View>
      </View>
      <View className="spark-row-status">
        <Text className={`spark-streak spark-streak-${fireTone}`}>{friend.archived ? '已归档' : `${friend.streak_days}天`}</Text>
        <Text className={`spark-task-state ${task?.enabled ? 'spark-task-state-active' : ''}`}>{task ? task.enabled ? '维护中' : '任务已暂停' : '未配置任务'}</Text>
      </View>
      <Text className="spark-last-activity">{formatActivityTime(friend.last_message_at || friend.last_sent_at)}</Text>
      <View className="spark-master-switch"><Switch checked={friend.spark_enabled} disabled={!canManageSpark || friend.archived || friend.spark_supported === false || friendBusy} color="#12b878" onChange={(event) => onFriendToggle?.(event.detail.value)} /></View>
    </View>

    {expanded && <View className="spark-conversation-details">
      <View className="spark-meta-row">
        <Text className="spark-meta-item">{friend.short_id ? `抖音号 ${friend.short_id}` : identityLabel}</Text>
        <Text className="spark-meta-separator">·</Text>
        <Text className="spark-meta-item">{friend.has_conversation ? '已有会话' : '暂无会话'}</Text>
      </View>
      {!canManageSpark && <View className="spark-disabled-panel"><Text className="spark-disabled-title">{isGroup ? '群聊暂不参与火花维护' : '该会话暂不支持火花维护'}</Text><Text className="spark-disabled-caption">仍可查看会话并管理归档状态。</Text></View>}
      {task ? <View className="spark-task-panel">
        <View className="spark-task-heading"><View><Text className="spark-task-kicker">每日任务</Text><Text className="spark-task-time">{task.window_start.slice(0, 5)}–{task.window_end.slice(0, 5)} · {task.timezone}</Text></View><Switch checked={task.enabled} disabled={friend.archived || taskBusy} color="#12b878" onChange={(event) => onTaskToggle?.(event.detail.value)} /></View>
        <Text className="spark-task-message">{task.message.body || (task.message.kind === 'sticker' ? '贴纸消息' : '未填写消息')}</Text>
        <Button className="spark-task-edit-button" disabled={busyKey !== '' || friend.archived} onClick={onEditTask}>{editingTaskId === task.id ? '收起编辑' : '编辑任务'}</Button>
        {editingTaskId === task.id && taskDraft && <View className="task-editor"><View className="task-time-grid"><View><Text className="history-label">开始时间</Text><Input className="task-input" value={taskDraft.windowStart} onInput={(event) => onDraftChange({ ...taskDraft, windowStart: event.detail.value })} placeholder="19:30" /></View><View><Text className="history-label">结束时间</Text><Input className="task-input" value={taskDraft.windowEnd} onInput={(event) => onDraftChange({ ...taskDraft, windowEnd: event.detail.value })} placeholder="22:30" /></View></View>{templates.length > 0 && <SparkTemplatePicker templates={templates} selectedKind={taskDraft.messageKind} selectedBody={taskDraft.message} onSelect={(template) => onDraftChange({ ...taskDraft, messageKind: template.kind, message: template.body })} />}<Text className="history-label">{taskDraft.messageKind === 'sticker' ? '贴纸 ID' : '消息内容'}</Text>{taskDraft.messageKind === 'sticker' ? <Input className="task-input task-message-input" value={taskDraft.message} maxlength={200} onInput={(event) => onDraftChange({ ...taskDraft, message: event.detail.value })} placeholder="输入贴纸 ID" /> : <Textarea className="task-textarea" value={taskDraft.message} maxlength={500} onInput={(event) => onDraftChange({ ...taskDraft, message: event.detail.value })} placeholder="输入每天要发送的文字" /> }<View className="task-editor-actions"><Button className="task-cancel-button" onClick={onCancelTask}>取消</Button><Button className="mini-button primary-button task-save-button" disabled={busyKey === `task-save:${task.id}`} onClick={onSaveTask}>{busyKey === `task-save:${task.id}` ? '保存中…' : '保存任务'}</Button></View></View>}
      </View> : <View className="spark-task-panel spark-task-panel-empty"><Text className="spark-task-kicker">每日任务</Text><Text className="spark-task-empty">{friend.archived ? '恢复会话后可继续配置任务。' : '尚未配置，请在“任务”页创建。'}</Text></View>}
      <View className="spark-card-actions"><Button className="spark-archive-button" disabled={busyKey === `archive:${friend.conversation_id}`} onClick={onArchive}>{busyKey === `archive:${friend.conversation_id}` ? '处理中…' : friend.archived ? '恢复会话' : '归档会话'}</Button></View>
    </View>}
  </View>
}

function PlatformArchiveControls({ archived, busy, active, status, onRequest, onCancel }: { archived: boolean; busy: boolean; active: boolean; status: string; onRequest: () => void; onCancel: () => void }) {
  if (active) return <View className="conversation-platform-status"><Text>平台操作：{status || '处理中…'}</Text><Button className="conversation-platform-cancel" onClick={onCancel}>取消请求</Button></View>
  return <Button className="conversation-platform-button" disabled={busy} onClick={onRequest}>{archived ? '请求平台恢复' : '请求平台归档'}</Button>
}

function ConversationSyncControls({ busy, active, cancelable, available, status, onSync, onCancel, onBind }: { busy: boolean; active: boolean; cancelable: boolean; available: boolean; status: string; onSync: () => void; onCancel: () => void; onBind: () => void }) {
  if (!available && !active) return <View className="conversation-sync-unavailable"><View><Text>账号尚未完成抖音绑定</Text><Text className="muted">绑定成功后，才能从消息面板同步会话。</Text></View><Button className="conversation-sync-bind" onClick={onBind}>去绑定</Button></View>
  if (active) return <View className="conversation-sync-status"><Text>会话同步：{status || '处理中…'}</Text>{cancelable && <Button className="conversation-sync-cancel" onClick={onCancel}>取消同步</Button>}</View>
  return <Button className="conversation-sync-button" disabled={busy} onClick={onSync}><View className="conversation-sync-icon"><MiniRemoteImage src={syncIcon} mode="aspectFit" /></View><Text>同步会话</Text></Button>
}

function SparkTemplatePicker({ templates, selectedKind, selectedBody, onSelect }: { templates: MessageTemplate[]; selectedKind: 'text' | 'sticker'; selectedBody: string; onSelect: (template: MessageTemplate) => void }) {
  const labels = ['选择模板，将内容复制到任务', ...templates.map((template) => `${template.name} · ${template.kind === 'sticker' ? '贴纸' : '文字'}`)]
  const selectedIndex = templatePickerIndex(templates, selectedKind, selectedBody)
  return <View className="task-template-picker"><Text className="history-label">从模板套用</Text><Picker mode="selector" range={labels} value={selectedIndex} onChange={(event) => { const template = templates[Number(event.detail.value) - 1]; if (template) onSelect(template) }}><View className="task-picker-control"><Text>{labels[selectedIndex]}</Text><Text className="task-picker-arrow">›</Text></View></Picker><Text className="muted">套用后仍可继续编辑，任务保存当前内容快照。</Text></View>
}

function SparkPageTitle() { return <View className="spark-page-heading"><Text className="spark-title">会话</Text><Text className="spark-subtitle">好友与群聊统一维护火花</Text></View> }
function GuestSpark() { return <MiniPageLayout pageClassName="spark-page" title={<SparkPageTitle />} align="start"><View className="spark-empty-card spark-standalone-empty"><MiniRemoteImage className="spark-empty-image" name="home/empty-gift-box.png" mode="aspectFit" /><Text className="spark-empty-title">请先登录</Text><Text className="muted">登录后才能查看好友与群聊，并统一维护火花。</Text><Button className="mini-button primary-button" onClick={() => Taro.switchTab({ url: '/pages/login/index' })}>去登录 / 绑定</Button></View></MiniPageLayout> }
function EmptySpark() { return <MiniPageLayout pageClassName="spark-page" title={<SparkPageTitle />} align="start"><View className="spark-empty-card spark-standalone-empty"><MiniRemoteImage className="spark-empty-image" name="accounts/account-add-hero.png" mode="aspectFit" /><Text className="spark-empty-title">还没有可管理的账号</Text><Text className="muted">请先绑定抖音账号并同步消息面板会话。</Text><Button className="mini-button primary-button" onClick={() => Taro.switchTab({ url: '/pages/accounts/index' })}>去绑定账号</Button></View></MiniPageLayout> }
function ErrorSpark({ message, onRetry }: { message: string; onRetry: () => void }) { return <MiniPageLayout pageClassName="spark-page" title={<SparkPageTitle />} align="start"><View className="spark-empty-card spark-standalone-empty"><MiniRemoteImage className="spark-empty-image" name="home/empty-gift-box.png" mode="aspectFit" /><Text className="spark-empty-title">会话暂时不可用</Text><Text className="muted">{message || '请检查网络连接后重试。'}</Text><Button className="mini-button secondary-button" onClick={onRetry}>重新加载</Button></View></MiniPageLayout> }
function LoadingSpark() { return <MiniPageLayout pageClassName="spark-page" title={<View className="spark-loading-heading"><View className="loading-line loading-line-wide" /><View className="loading-line" /></View>} align="start"><View className="spark-loading-card"><View className="loading-line" /><View className="loading-block" /></View><View className="spark-loading-card"><View className="loading-line" /><View className="loading-block" /></View></MiniPageLayout> }

function avatarAssetFor(name: string) {
  const value = name.toLocaleLowerCase('zh-CN')
  if (value.includes('jasper') || name.includes('杰') || name.includes('雅') || name.includes('拾')) return avatarDoodle
  if (value.includes('chen') || name.includes('陈') || name.includes('王') || name.includes('欣')) return avatarPink
  return avatarAqua
}

function formatActivityTime(value?: string | null) {
  if (!value) return '暂无动态'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '暂无动态'
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const prefix = startOfDate === startOfToday ? '今天' : startOfDate === startOfToday - 86400000 ? '昨天' : `${date.getMonth() + 1}/${date.getDate()}`
  return `${prefix} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function formatSyncTime(value?: string | null) {
  if (!value) return '暂无记录'
  const formatted = formatActivityTime(value)
  return formatted.startsWith('今天 ') ? formatted.slice(3) : formatted
}
function jobStatusLabel(value: string) { return value === 'waiting_user' ? '等待用户操作' : value === 'running' ? '执行中' : value === 'succeeded' ? '已完成' : value === 'failed' ? '执行失败' : value === 'cancelled' ? '已取消' : '排队中' }
