import { useCallback, useEffect, useRef, useState } from 'react'
import { Input, Picker, Switch, Text, Textarea, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'

import { getAccessToken } from '@/lib/session'
import { cancelJob, getJob, listAccounts, listFriends, listMessageTemplates, listTasks, MiniApiError, requestPlatformConversationArchive, setConversationArchived, syncAccountFriends, updateFriend, updateTask } from '@/lib/api'
import { AccountTabs } from '@/components/account-tabs'
import { accountTabLabel } from '@/components/account-tab-utils'
import { createIdempotencyKey, selectAccountId } from '@/features/home/home-utils'
import { jobErrorMessage } from '@/features/job-error-utils'
import { enabledTaskCount, replaceFriend, replaceTask, taskDraftError, taskForFriend, taskTimeInput, taskTimePayload, templatePickerIndex } from '@/features/spark/spark-utils'
import { MiniButton as Button } from '@/components/mini-button'

type SparkData = {
  accounts: Awaited<ReturnType<typeof listAccounts>>['items']
  friends: Awaited<ReturnType<typeof listFriends>>['items']
  tasks: Awaited<ReturnType<typeof listTasks>>['items']
}

type MessageTemplate = Awaited<ReturnType<typeof listMessageTemplates>>['items'][number]
type TaskDraft = { windowStart: string; windowEnd: string; message: string; messageKind: 'text' | 'sticker' }
type PlatformArchiveJob = { id: string; conversationId: string; archived: boolean }
type ConversationSyncJob = { id: string; cancelable: boolean }

export default function Spark() {
  const [state, setState] = useState<'loading' | 'guest' | 'empty' | 'ready' | 'error'>('loading')
  const [data, setData] = useState<SparkData | null>(null)
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const selectedAccountIdRef = useRef('')
  const [showArchived, setShowArchived] = useState(false)
  const [busyKey, setBusyKey] = useState('')
  const [error, setError] = useState('')
  const [editingTaskId, setEditingTaskId] = useState('')
  const [taskDraft, setTaskDraft] = useState<TaskDraft | null>(null)
  const [templates, setTemplates] = useState<MessageTemplate[]>([])
  const [platformArchiveJob, setPlatformArchiveJob] = useState<PlatformArchiveJob | null>(null)
  const [platformArchiveStatus, setPlatformArchiveStatus] = useState('')
  const [conversationSyncJob, setConversationSyncJob] = useState<ConversationSyncJob | null>(null)
  const [conversationSyncStatus, setConversationSyncStatus] = useState('')

  const load = useCallback(async (accountId?: string, includeArchived = false) => {
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
        listFriends(token, nextAccountId, { includeArchived }),
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
          await load(selectedAccountIdRef.current, showArchived)
          if (active) await Taro.showToast({ title: platformArchiveJob.archived ? '平台归档完成' : '平台恢复完成', icon: 'success' })
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
  }, [platformArchiveJob, load, showArchived])

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
          await load(selectedAccountIdRef.current, showArchived)
          if (active) await Taro.showToast({ title: '会话同步完成', icon: 'success' })
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
  }, [conversationSyncJob, load, showArchived])

  async function chooseAccount(accountId: string) {
    closeTaskEditor()
    selectedAccountIdRef.current = accountId
    setSelectedAccountId(accountId)
    await load(accountId, showArchived)
  }

  async function changeArchiveView(archived: boolean) {
    if (archived === showArchived) return
    closeTaskEditor()
    setShowArchived(archived)
    await load(selectedAccountIdRef.current, archived)
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
      await load(selectedAccountId, showArchived)
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
      await Taro.showToast({ title: '同步请求已取消', icon: 'success' })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '取消同步请求失败')
    } finally {
      setBusyKey('')
    }
  }

  async function requestPlatformArchive(friend: SparkData['friends'][number]) {
    const token = getAccessToken()
    if (!token || !data || busyKey || platformArchiveJob) return
    const archived = !friend.archived
    const result = await Taro.showModal({ title: archived ? '请求平台归档？' : '请求平台恢复？', content: '这会创建后台任务，请求抖音平台变更会话状态；平台最终结果以适配器确认事件为准。' })
    if (!result.confirm) return
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
      await Taro.showToast({ title: '平台请求已取消', icon: 'success' })
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

  if (state === 'loading') return <LoadingSpark />
  if (state === 'guest') return <GuestSpark />
  if (state === 'error') return <ErrorSpark message={error} onRetry={() => void load(selectedAccountId)} />
  if (!data || state === 'empty') return <EmptySpark />

  const selectedAccount = data.accounts.find((account) => account.id === selectedAccountId)
  const visibleTasks = data.tasks.filter((task) => task.account_id === selectedAccountId)
  const visibleFriends = data.friends.filter((friend) => showArchived ? friend.archived : !friend.archived)

  return <View className="mini-page"><View className="mini-hero card"><Text className="eyebrow">M4 · 会话与火花</Text><Text className="title mini-hero-title">维护会话火花</Text><Text className="muted">按账号查看直接会话与群聊，分别控制火花维护和每日任务。</Text></View><AccountTabs accounts={data.accounts} selectedId={selectedAccountId} onSelect={(id) => void chooseAccount(id)} /><View className="conversation-view-tabs"><Button className={`conversation-view-tab ${!showArchived ? 'conversation-view-tab-active' : ''}`} onClick={() => void changeArchiveView(false)}>当前会话</Button><Button className={`conversation-view-tab ${showArchived ? 'conversation-view-tab-active' : ''}`} onClick={() => void changeArchiveView(true)}>已归档</Button></View><View className="section-title"><Text>{selectedAccount ? accountTabLabel(selectedAccount) : '当前账号'}</Text><Text className="muted">{visibleFriends.length} 个{showArchived ? '已归档会话' : '会话'} · {enabledTaskCount(visibleTasks)} 个任务启用</Text></View><ConversationSyncControls busy={busyKey !== ''} active={conversationSyncJob !== null} cancelable={conversationSyncJob?.cancelable ?? false} available={selectedAccount?.binding_status === 'bound'} status={conversationSyncStatus} onSync={() => void syncConversations()} onCancel={() => void cancelConversationSync()} onBind={() => Taro.switchTab({ url: '/pages/accounts/index' })} />{error && <View className="card error-card"><Text>{error}</Text></View>}{visibleFriends.length === 0 ? <View className="card empty-card"><Text className="card-title">{showArchived ? '暂无已归档会话' : '还没有会话'}</Text><Text className="muted">{showArchived ? '归档后的会话会显示在这里，可随时恢复。' : '先完成账号绑定，再同步消息面板会话。'}</Text></View> : <View>{visibleFriends.map((friend) => { const task = taskForFriend(visibleTasks, friend.id); const platformBusy = platformArchiveJob?.conversationId === friend.conversation_id; return <View className="spark-friend-group" key={`${friend.conversation_id}:${friend.id}`}><FriendCard friend={friend} task={task} templates={templates} busyKey={busyKey} editingTaskId={editingTaskId} taskDraft={taskDraft} onFriendToggle={(enabled) => void toggleFriend(friend.id, enabled)} onTaskToggle={task ? (enabled) => void toggleTask(task.id, enabled) : undefined} onEditTask={task ? () => openTaskEditor(task) : undefined} onDraftChange={setTaskDraft} onSaveTask={task ? () => void saveTask(task) : undefined} onCancelTask={closeTaskEditor} onArchive={() => void toggleArchive(friend)} /><PlatformArchiveControls archived={friend.archived} busy={busyKey !== ''} active={platformBusy} status={platformBusy ? platformArchiveStatus : ''} onRequest={() => void requestPlatformArchive(friend)} onCancel={() => void cancelPlatformArchive()} /></View> })}</View>}</View>
}

function FriendCard({ friend, task, templates, busyKey, editingTaskId, taskDraft, onFriendToggle, onTaskToggle, onEditTask, onDraftChange, onSaveTask, onCancelTask, onArchive }: { friend: SparkData['friends'][number]; task?: SparkData['tasks'][number]; templates: MessageTemplate[]; busyKey: string; editingTaskId: string; taskDraft: TaskDraft | null; onFriendToggle: (enabled: boolean) => void; onTaskToggle?: (enabled: boolean) => void; onEditTask?: () => void; onDraftChange: (draft: TaskDraft | null) => void; onSaveTask?: () => void; onCancelTask: () => void; onArchive: () => void }) {
  const friendBusy = busyKey === `friend:${friend.id}`
  const taskBusy = task ? busyKey === `task:${task.id}` : false
  const identityLabel = friend.conversation_type === 'group' ? '群聊会话' : friend.platform_identity_status === 'resolved' ? '身份已确认' : friend.platform_identity_status === 'pending' ? '身份待确认' : '需处理'
  return <View className="card friend-card"><View className="card-heading"><View><Text className="card-title">{friend.nickname || friend.display_name}</Text><Text className="muted">{friend.short_id ? `抖音号 ${friend.short_id}` : identityLabel}</Text></View><Text className="streak-badge">{friend.streak_days} 天火花</Text></View><Text className="muted">{friend.has_conversation ? '已有会话' : '暂无会话'} · {friend.last_sent_at ? `上次发送 ${formatDate(friend.last_sent_at)}` : '还未发送'}</Text><View className="toggle-row"><View><Text className="toggle-title">火花维护</Text><Text className="muted">{friend.spark_enabled ? '每日保持火花' : '暂不维护'}</Text></View><Switch checked={friend.spark_enabled} disabled={friend.archived || friend.spark_supported === false || friendBusy} color="#1f5bd8" onChange={(event) => onFriendToggle(event.detail.value)} /></View>{task ? <View className="task-panel"><View className="toggle-row"><View><Text className="toggle-title">每日任务</Text><Text className="muted">{task.window_start.slice(0, 5)}–{task.window_end.slice(0, 5)} · {task.timezone}</Text></View><Switch checked={task.enabled} disabled={friend.archived || taskBusy} color="#15966b" onChange={(event) => onTaskToggle?.(event.detail.value)} /></View><Text className="task-message">{task.message.body || (task.message.kind === 'sticker' ? '贴纸消息' : '未填写消息')}</Text><Button className="task-edit-button" disabled={busyKey !== '' || friend.archived} onClick={onEditTask}>{editingTaskId === task.id ? '收起编辑' : '编辑任务'}</Button>{editingTaskId === task.id && taskDraft && <View className="task-editor"><View className="task-time-grid"><View><Text className="history-label">开始时间</Text><Input className="task-input" value={taskDraft.windowStart} onInput={(event) => onDraftChange({ ...taskDraft, windowStart: event.detail.value })} placeholder="19:30" /></View><View><Text className="history-label">结束时间</Text><Input className="task-input" value={taskDraft.windowEnd} onInput={(event) => onDraftChange({ ...taskDraft, windowEnd: event.detail.value })} placeholder="22:30" /></View></View>{templates.length > 0 && <SparkTemplatePicker templates={templates} selectedKind={taskDraft.messageKind} selectedBody={taskDraft.message} onSelect={(template) => onDraftChange({ ...taskDraft, messageKind: template.kind, message: template.body })} />}<Text className="history-label">{taskDraft.messageKind === 'sticker' ? '贴纸 ID' : '消息内容'}</Text>{taskDraft.messageKind === 'sticker' ? <Input className="task-input task-message-input" value={taskDraft.message} maxlength={200} onInput={(event) => onDraftChange({ ...taskDraft, message: event.detail.value })} placeholder="输入贴纸 ID" /> : <Textarea className="task-textarea" value={taskDraft.message} maxlength={500} onInput={(event) => onDraftChange({ ...taskDraft, message: event.detail.value })} placeholder="输入每天要发送的文字" /> }<View className="task-editor-actions"><Button className="task-cancel-button" onClick={onCancelTask}>取消</Button><Button className="mini-button primary-button task-save-button" disabled={busyKey === `task-save:${task.id}`} onClick={onSaveTask}>{busyKey === `task-save:${task.id}` ? '保存中…' : '保存任务'}</Button></View></View>}</View> : <View className="task-panel"><Text className="muted">{friend.archived ? '已归档，会话恢复后可继续配置任务。' : '尚未配置每日任务，请在“任务”页创建。'}</Text></View>}<Button className="conversation-archive-button" disabled={busyKey === `archive:${friend.conversation_id}`} onClick={onArchive}>{busyKey === `archive:${friend.conversation_id}` ? '处理中…' : friend.archived ? '恢复会话' : '归档会话'}</Button></View>
}

function PlatformArchiveControls({ archived, busy, active, status, onRequest, onCancel }: { archived: boolean; busy: boolean; active: boolean; status: string; onRequest: () => void; onCancel: () => void }) {
  if (active) return <View className="conversation-platform-status"><Text>平台操作：{status || '处理中…'}</Text><Button className="conversation-platform-cancel" onClick={onCancel}>取消请求</Button></View>
  return <Button className="conversation-platform-button" disabled={busy} onClick={onRequest}>{archived ? '请求平台恢复' : '请求平台归档'}</Button>
}

function ConversationSyncControls({ busy, active, cancelable, available, status, onSync, onCancel, onBind }: { busy: boolean; active: boolean; cancelable: boolean; available: boolean; status: string; onSync: () => void; onCancel: () => void; onBind: () => void }) {
  if (!available && !active) return <View className="conversation-sync-unavailable"><View><Text>账号尚未完成抖音绑定</Text><Text className="muted">绑定成功后，才能从消息面板同步会话。</Text></View><Button className="conversation-sync-bind" onClick={onBind}>去绑定</Button></View>
  if (active) return <View className="conversation-sync-status"><Text>会话同步：{status || '处理中…'}</Text>{cancelable && <Button className="conversation-sync-cancel" onClick={onCancel}>取消同步</Button>}</View>
  return <Button className="conversation-sync-button" disabled={busy} onClick={onSync}>同步会话</Button>
}

function SparkTemplatePicker({ templates, selectedKind, selectedBody, onSelect }: { templates: MessageTemplate[]; selectedKind: 'text' | 'sticker'; selectedBody: string; onSelect: (template: MessageTemplate) => void }) {
  const labels = ['选择模板，将内容复制到任务', ...templates.map((template) => `${template.name} · ${template.kind === 'sticker' ? '贴纸' : '文字'}`)]
  const selectedIndex = templatePickerIndex(templates, selectedKind, selectedBody)
  return <View className="task-template-picker"><Text className="history-label">从模板套用</Text><Picker mode="selector" range={labels} value={selectedIndex} onChange={(event) => { const template = templates[Number(event.detail.value) - 1]; if (template) onSelect(template) }}><View className="task-picker-control"><Text>{labels[selectedIndex]}</Text><Text className="task-picker-arrow">›</Text></View></Picker><Text className="muted">套用后仍可继续编辑，任务保存当前内容快照。</Text></View>
}

function GuestSpark() { return <View className="mini-page"><View className="card empty-card"><Text className="card-title">请先登录</Text><Text className="muted">登录后才能查看直接会话与群聊的火花开关。</Text><Button className="mini-button primary-button" onClick={() => Taro.switchTab({ url: '/pages/login/index' })}>去登录 / 绑定</Button></View></View> }
function EmptySpark() { return <View className="mini-page"><View className="card empty-card"><Text className="card-title">还没有可管理的账号</Text><Text className="muted">请先在 PC 端绑定抖音账号并同步消息面板会话。</Text></View></View> }
function ErrorSpark({ message, onRetry }: { message: string; onRetry: () => void }) { return <View className="mini-page"><View className="card empty-card"><Text className="card-title">火花列表暂时不可用</Text><Text className="muted">{message || '请检查网络连接后重试。'}</Text><Button className="mini-button secondary-button" onClick={onRetry}>重新加载</Button></View></View> }
function LoadingSpark() { return <View className="mini-page"><View className="card loading-card"><View className="loading-line loading-line-wide" /><View className="loading-line" /><View className="loading-block" /></View><View className="card loading-card"><View className="loading-line" /><View className="loading-block" /></View></View> }
function formatDate(value: string) { return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(new Date(value)) }
function jobStatusLabel(value: string) { return value === 'waiting_user' ? '等待用户操作' : value === 'running' ? '执行中' : value === 'succeeded' ? '已完成' : value === 'failed' ? '执行失败' : value === 'cancelled' ? '已取消' : '排队中' }
