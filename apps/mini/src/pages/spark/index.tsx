import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Input, Switch, Text, Textarea, View } from '@tarojs/components'
import Taro from '@tarojs/taro'

import { getAccessToken } from '@/lib/session'
import { listAccounts, listFriends, listTasks, MiniApiError, updateFriend, updateTask } from '@/lib/api'
import { AccountTabs } from '@/components/account-tabs'
import { enabledTaskCount, replaceFriend, replaceTask, taskDraftError, taskForFriend, taskTimeInput, taskTimePayload } from '@/features/spark/spark-utils'

type SparkData = {
  accounts: Awaited<ReturnType<typeof listAccounts>>['items']
  friends: Awaited<ReturnType<typeof listFriends>>['items']
  tasks: Awaited<ReturnType<typeof listTasks>>['items']
}

type TaskDraft = { windowStart: string; windowEnd: string; message: string }

export default function Spark() {
  const [state, setState] = useState<'loading' | 'guest' | 'empty' | 'ready' | 'error'>('loading')
  const [data, setData] = useState<SparkData | null>(null)
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const selectedAccountIdRef = useRef('')
  const [busyKey, setBusyKey] = useState('')
  const [error, setError] = useState('')
  const [editingTaskId, setEditingTaskId] = useState('')
  const [taskDraft, setTaskDraft] = useState<TaskDraft | null>(null)

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
      const nextAccountId = accountId || selectedAccountIdRef.current || accounts[0]?.id || ''
      if (!nextAccountId) {
        setData({ accounts, friends: [], tasks: [] })
        setState('empty')
        return
      }
      const [friendsResponse, tasksResponse] = await Promise.all([
        listFriends(token, nextAccountId),
        listTasks(token),
      ])
      selectedAccountIdRef.current = nextAccountId
      setSelectedAccountId(nextAccountId)
      setData({ accounts, friends: friendsResponse.items, tasks: tasksResponse.items })
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

  useEffect(() => { void load() }, [load])

  async function chooseAccount(accountId: string) {
    closeTaskEditor()
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

  function openTaskEditor(task: SparkData['tasks'][number]) {
    setEditingTaskId(task.id)
    setTaskDraft({ windowStart: taskTimeInput(task.window_start), windowEnd: taskTimeInput(task.window_end), message: task.message.body ?? '' })
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
        message: { kind: task.message.kind, body: taskDraft.message.trim() },
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

  return <View className="mini-page"><View className="mini-hero card"><Text className="eyebrow">M4 · 会话与火花</Text><Text className="title mini-hero-title">维护会话火花</Text><Text className="muted">按账号查看好友与群聊会话，分别控制火花维护和每日任务。</Text></View><AccountTabs accounts={data.accounts} selectedId={selectedAccountId} onSelect={(id) => void chooseAccount(id)} /><View className="section-title"><Text>{selectedAccount?.nickname || '当前账号'}</Text><Text className="muted">{data.friends.length} 个会话 · {enabledTaskCount(visibleTasks)} 个任务启用</Text></View>{error && <View className="card error-card"><Text>{error}</Text></View>}{data.friends.length === 0 ? <View className="card empty-card"><Text className="card-title">还没有会话</Text><Text className="muted">请先在 PC 端同步消息面板会话，再回来管理火花。</Text></View> : <View>{data.friends.map((friend) => { const task = taskForFriend(visibleTasks, friend.id); return <FriendCard key={friend.id} friend={friend} task={task} busyKey={busyKey} editingTaskId={editingTaskId} taskDraft={taskDraft} onFriendToggle={(enabled) => void toggleFriend(friend.id, enabled)} onTaskToggle={task ? (enabled) => void toggleTask(task.id, enabled) : undefined} onEditTask={task ? () => openTaskEditor(task) : undefined} onDraftChange={setTaskDraft} onSaveTask={task ? () => void saveTask(task) : undefined} onCancelTask={closeTaskEditor} /> })}</View>}</View>
}

function FriendCard({ friend, task, busyKey, editingTaskId, taskDraft, onFriendToggle, onTaskToggle, onEditTask, onDraftChange, onSaveTask, onCancelTask }: { friend: SparkData['friends'][number]; task?: SparkData['tasks'][number]; busyKey: string; editingTaskId: string; taskDraft: TaskDraft | null; onFriendToggle: (enabled: boolean) => void; onTaskToggle?: (enabled: boolean) => void; onEditTask?: () => void; onDraftChange: (draft: TaskDraft | null) => void; onSaveTask?: () => void; onCancelTask: () => void }) {
  const friendBusy = busyKey === `friend:${friend.id}`
  const taskBusy = task ? busyKey === `task:${task.id}` : false
  const identityLabel = friend.conversation_type === 'group' ? '群聊会话' : friend.platform_identity_status === 'resolved' ? '身份已确认' : friend.platform_identity_status === 'pending' ? '身份待确认' : '需处理'
  return <View className="card friend-card"><View className="card-heading"><View><Text className="card-title">{friend.nickname || friend.display_name}</Text><Text className="muted">{friend.short_id ? `抖音号 ${friend.short_id}` : identityLabel}</Text></View><Text className="streak-badge">{friend.streak_days} 天火花</Text></View><Text className="muted">{friend.has_conversation ? '已有会话' : '暂无会话'} · {friend.last_sent_at ? `上次发送 ${formatDate(friend.last_sent_at)}` : '还未发送'}</Text><View className="toggle-row"><View><Text className="toggle-title">火花维护</Text><Text className="muted">{friend.spark_enabled ? '每日保持火花' : '暂不维护'}</Text></View><Switch checked={friend.spark_enabled} disabled={friend.spark_supported === false || friendBusy} color="#1f5bd8" onChange={(event) => onFriendToggle(event.detail.value)} /></View>{task ? <View className="task-panel"><View className="toggle-row"><View><Text className="toggle-title">每日任务</Text><Text className="muted">{task.window_start.slice(0, 5)}–{task.window_end.slice(0, 5)} · {task.timezone}</Text></View><Switch checked={task.enabled} disabled={taskBusy} color="#15966b" onChange={(event) => onTaskToggle?.(event.detail.value)} /></View><Text className="task-message">{task.message.body || (task.message.kind === 'sticker' ? '贴纸消息' : '未填写消息')}</Text><Button className="task-edit-button" disabled={busyKey !== ''} onClick={onEditTask}>{editingTaskId === task.id ? '收起编辑' : '编辑任务'}</Button>{editingTaskId === task.id && taskDraft && <View className="task-editor"><View className="task-time-grid"><View><Text className="history-label">开始时间</Text><Input className="task-input" value={taskDraft.windowStart} onInput={(event) => onDraftChange({ ...taskDraft, windowStart: event.detail.value })} placeholder="19:30" /></View><View><Text className="history-label">结束时间</Text><Input className="task-input" value={taskDraft.windowEnd} onInput={(event) => onDraftChange({ ...taskDraft, windowEnd: event.detail.value })} placeholder="22:30" /></View></View><Text className="history-label">{task.message.kind === 'sticker' ? '贴纸 ID' : '消息内容'}</Text>{task.message.kind === 'sticker' ? <Input className="task-input task-message-input" value={taskDraft.message} maxlength={200} onInput={(event) => onDraftChange({ ...taskDraft, message: event.detail.value })} placeholder="输入贴纸 ID" /> : <Textarea className="task-textarea" value={taskDraft.message} maxlength={500} onInput={(event) => onDraftChange({ ...taskDraft, message: event.detail.value })} placeholder="输入每天要发送的文字" /> }<View className="task-editor-actions"><Button className="task-cancel-button" onClick={onCancelTask}>取消</Button><Button className="mini-button primary-button task-save-button" disabled={busyKey === `task-save:${task.id}`} onClick={onSaveTask}>{busyKey === `task-save:${task.id}` ? '保存中…' : '保存任务'}</Button></View></View>}</View> : <View className="task-panel"><Text className="muted">尚未配置每日任务，请在“任务”页创建。</Text></View>}</View>
}

function GuestSpark() { return <View className="mini-page"><View className="card empty-card"><Text className="card-title">请先登录</Text><Text className="muted">登录后才能查看好友与群聊会话的火花开关。</Text><Button className="mini-button primary-button" onClick={() => Taro.switchTab({ url: '/pages/login/index' })}>去登录 / 绑定</Button></View></View> }
function EmptySpark() { return <View className="mini-page"><View className="card empty-card"><Text className="card-title">还没有可管理的账号</Text><Text className="muted">请先在 PC 端绑定抖音账号并同步消息面板会话。</Text></View></View> }
function ErrorSpark({ message, onRetry }: { message: string; onRetry: () => void }) { return <View className="mini-page"><View className="card empty-card"><Text className="card-title">火花列表暂时不可用</Text><Text className="muted">{message || '请检查网络连接后重试。'}</Text><Button className="mini-button secondary-button" onClick={onRetry}>重新加载</Button></View></View> }
function LoadingSpark() { return <View className="mini-page"><View className="card loading-card"><View className="loading-line loading-line-wide" /><View className="loading-line" /><View className="loading-block" /></View><View className="card loading-card"><View className="loading-line" /><View className="loading-block" /></View></View> }
function formatDate(value: string) { return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(new Date(value)) }
