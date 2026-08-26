import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Image, Input, Switch, Text, Textarea, View } from '@tarojs/components'
import Taro from '@tarojs/taro'

import { getAccessToken } from '@/lib/session'
import { listAccounts, listFriends, listSendIntents, listTasks, MiniApiError, runTaskNow, updateTask } from '@/lib/api'
import { createIdempotencyKey } from '@/features/home/home-utils'
import taskChecklist from '@/assets/tasks/task-checklist.png'

type Task = Awaited<ReturnType<typeof listTasks>>['items'][number]
type Account = Awaited<ReturnType<typeof listAccounts>>['items'][number]
type Friend = Awaited<ReturnType<typeof listFriends>>['items'][number]
type HistoryItem = Awaited<ReturnType<typeof listSendIntents>>['items'][number]
type Screen = 'list' | 'detail' | 'edit' | 'history'
type Filter = 'all' | 'enabled' | 'paused'
type Draft = { windowStart: string; windowEnd: string; message: string; allowFirstMessage: boolean }

export default function Tasks() {
  const [state, setState] = useState<'loading' | 'guest' | 'ready' | 'error'>('loading')
  const [tasks, setTasks] = useState<Task[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [friends, setFriends] = useState<Record<string, Friend>>({})
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [screen, setScreen] = useState<Screen>('list')
  const [selectedTaskId, setSelectedTaskId] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [draft, setDraft] = useState<Draft | null>(null)

  const load = useCallback(async () => {
    const token = getAccessToken()
    if (!token) {
      setState('guest')
      return
    }
    setState('loading')
    setError('')
    try {
      const [accountsResponse, tasksResponse] = await Promise.all([listAccounts(token), listTasks(token)])
      const friendResponses = await Promise.all(accountsResponse.items.map((account) => listFriends(token, account.id)))
      const friendIndex: Record<string, Friend> = {}
      friendResponses.forEach((response) => response.items.forEach((friend) => { friendIndex[friend.id] = friend }))
      setAccounts(accountsResponse.items)
      setTasks(tasksResponse.items)
      setFriends(friendIndex)
      setState('ready')
    } catch (cause) {
      if (cause instanceof MiniApiError && cause.statusCode === 401) {
        setState('guest')
        return
      }
      setError(cause instanceof Error ? cause.message : '任务列表加载失败')
      setState('error')
    }
  }, [])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    const token = getAccessToken()
    if (!token || screen !== 'detail' || !selectedTaskId) return
    let active = true
    void listSendIntents(token, { task_id: selectedTaskId })
      .then((response) => { if (active) setHistory(response.items) })
      .catch(() => { if (active) setHistory([]) })
    return () => { active = false }
  }, [screen, selectedTaskId])

  const visibleTasks = useMemo(() => filter === 'all' ? tasks : tasks.filter((task) => filter === 'enabled' ? task.enabled : !task.enabled), [filter, tasks])

  if (state === 'loading') return <LoadingTasks />
  if (state === 'guest') return <GuestTasks />
  if (state === 'error') return <TaskError message={error} onRetry={() => void load()} />

  const selectedTask = tasks.find((task) => task.id === selectedTaskId)
  if (screen === 'edit' && selectedTask && draft) return <EditTask task={selectedTask} draft={draft} busy={busy} error={error} onBack={() => setScreen('detail')} onDraftChange={setDraft} onSave={() => void saveTask()} />
  if (screen === 'detail' && selectedTask) return <TaskDetail task={selectedTask} friend={friends[selectedTask.friend_id]} account={accounts.find((account) => account.id === selectedTask.account_id)} history={history} busy={busy} error={error} onBack={() => setScreen('list')} onEdit={() => openEdit(selectedTask)} onRun={() => void runTask(selectedTask)} onToggle={(enabled) => void toggleTask(selectedTask, enabled)} onHistory={() => void openHistory(selectedTask)} />
  if (screen === 'history' && selectedTask) return <TaskHistory task={selectedTask} friend={friends[selectedTask.friend_id]} history={history} onBack={() => setScreen('detail')} />

  async function toggleTask(task: Task, enabled: boolean) {
    const token = getAccessToken()
    if (!token || busy) return
    setBusy(task.id)
    setError('')
    try {
      const updated = await updateTask(token, task.id, { enabled })
      setTasks((current) => current.map((item) => item.id === updated.id ? updated : item))
      await Taro.showToast({ title: enabled ? '任务已启用' : '任务已暂停', icon: 'success' })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '任务状态更新失败')
    } finally {
      setBusy('')
    }
  }

  function openEdit(task: Task) {
    setError('')
    setDraft({ windowStart: task.window_start.slice(0, 5), windowEnd: task.window_end.slice(0, 5), message: task.message.body || '', allowFirstMessage: task.allow_first_message ?? false })
    setSelectedTaskId(task.id)
    setScreen('edit')
  }

  async function saveTask() {
    const token = getAccessToken()
    if (!token || !selectedTask || !draft || busy) return
    if (!draft.windowStart || !draft.windowEnd || draft.windowStart >= draft.windowEnd) {
      setError('请填写有效的发送时间窗口，结束时间必须晚于开始时间。')
      return
    }
    if (!draft.message.trim()) {
      setError('请填写消息内容。')
      return
    }
    setBusy('save')
    setError('')
    try {
      const updated = await updateTask(token, selectedTask.id, { window_start: `${draft.windowStart}:00`, window_end: `${draft.windowEnd}:00`, message: { kind: selectedTask.message.kind, body: draft.message.trim() }, allow_first_message: draft.allowFirstMessage })
      setTasks((current) => current.map((item) => item.id === updated.id ? updated : item))
      setScreen('detail')
      setDraft(null)
      await Taro.showToast({ title: '任务已保存', icon: 'success' })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '任务保存失败')
    } finally {
      setBusy('')
    }
  }

  async function runTask(task: Task) {
    const token = getAccessToken()
    if (!token || busy) return
    setBusy(`run:${task.id}`)
    setError('')
    try {
      await runTaskNow(token, task.id, createIdempotencyKey())
      await Taro.showToast({ title: '已加入发送队列', icon: 'success' })
      setScreen('detail')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '立即执行失败，请稍后重试。')
    } finally {
      setBusy('')
    }
  }

  async function openHistory(task: Task) {
    const token = getAccessToken()
    if (!token || busy) return
    setBusy('history')
    setSelectedTaskId(task.id)
    try {
      const response = await listSendIntents(token, { task_id: task.id })
      setHistory(response.items)
      setScreen('history')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '执行记录加载失败')
    } finally {
      setBusy('')
    }
  }

  return <View className="mini-page task-page"><View className="task-page-header"><View><Text className="task-page-kicker">Douyin Keeper</Text><Text className="task-page-title">任务</Text></View><Button className="task-new-button" onClick={() => Taro.showModal({ title: '请在 PC 端新建任务', content: '小程序负责启停和编辑已有任务；新建任务需要先在 PC 端选择已确认好友。' })}>+</Button></View><View className="task-filter-tabs">{([{ value: 'all', label: '全部' }, { value: 'enabled', label: '运行中' }, { value: 'paused', label: '已暂停' }] as const).map((item) => <Button key={item.value} className={filter === item.value ? 'task-filter-active' : ''} onClick={() => setFilter(item.value)}>{item.label}</Button>)}</View><View className="task-overview"><Overview label="运行中" value={tasks.filter((task) => task.enabled).length} tone="green" /><Overview label="已暂停" value={tasks.filter((task) => !task.enabled).length} tone="amber" /><Overview label="今日任务" value={tasks.length} tone="blue" /></View>{error && <View className="task-inline-error"><Text>{error}</Text></View>}{visibleTasks.length === 0 ? <EmptyTasks onCreate={() => Taro.showModal({ title: '请在 PC 端新建任务', content: '先绑定账号并同步好友，再在 PC 端创建每日火花任务。' })} /> : <View>{visibleTasks.map((task) => <TaskCard key={task.id} task={task} friend={friends[task.friend_id]} account={accounts.find((account) => account.id === task.account_id)} busy={busy === task.id} onSelect={() => { setSelectedTaskId(task.id); setScreen('detail') }} onToggle={(enabled) => void toggleTask(task, enabled)} />)}</View>}</View>
}

function TaskCard({ task, friend, account, busy, onSelect, onToggle }: { task: Task; friend?: Friend; account?: Account; busy: boolean; onSelect: () => void; onToggle: (enabled: boolean) => void }) { return <View className="task-card"><View className="task-card-heading"><View className="task-card-copy" onClick={onSelect}><Text className="task-card-name">{friend?.display_name || '未命名好友'}</Text><Text className="muted">关联账号：{account?.nickname || '未命名账号'}</Text></View><Text className={`task-status task-status-${task.enabled ? 'running' : 'paused'}`}>{task.enabled ? '运行中' : '已暂停'}</Text></View><View className="task-card-row"><Text className="task-row-label">时间窗口</Text><Text className="task-row-value">{task.window_start.slice(0, 5)} ～ {task.window_end.slice(0, 5)}</Text></View><View className="task-card-row"><Text className="task-row-label">消息内容</Text><Text className="task-message-preview">{task.message.body || (task.message.kind === 'sticker' ? '贴纸消息' : '未填写消息')}</Text></View><View className="task-card-bottom"><Text className="task-last-result">每日一次 · {task.timezone}</Text><Switch checked={task.enabled} disabled={busy} color="#19bb79" onChange={(event) => onToggle(event.detail.value)} /></View></View> }
function TaskDetail({ task, friend, account, history, busy, error, onBack, onEdit, onRun, onToggle, onHistory }: { task: Task; friend?: Friend; account?: Account; history: HistoryItem[]; busy: string; error: string; onBack: () => void; onEdit: () => void; onRun: () => void; onToggle: (enabled: boolean) => void; onHistory: () => void }) { return <View className="mini-page task-page"><View className="task-detail-topbar"><Button className="task-back-button" onClick={onBack}>‹</Button><Text>任务详情</Text><View className="task-topbar-spacer" /></View><View className="task-detail-hero"><View className="task-detail-avatar"><Text>{(friend?.display_name || '友').slice(0, 1)}</Text></View><View className="task-detail-copy"><Text className="task-detail-name">{friend?.display_name || '未命名好友'}</Text><Text className="muted">关联账号：{account?.nickname || '未命名账号'}</Text></View><Text className={`task-status task-status-${task.enabled ? 'running' : 'paused'}`}>{task.enabled ? '运行中' : '已暂停'}</Text></View>{error && <View className="task-inline-error"><Text>{error}</Text></View>}<View className="task-detail-card"><DetailRow label="时间窗口" value={`${task.window_start.slice(0, 5)} ～ ${task.window_end.slice(0, 5)}`} /><DetailRow label="消息类型" value={task.message.kind === 'sticker' ? '贴纸消息' : '私信消息'} /><DetailRow label="消息内容" value={task.message.body || '未填写消息'} multiline /><DetailRow label="允许首聊" value={task.allow_first_message ? '允许' : '不允许'} tone={task.allow_first_message ? 'green' : undefined} /></View><View className="task-detail-card"><View className="task-detail-row-with-control"><View><Text className="task-section-title">启用状态</Text><Text className="muted">停用后不会再进入每日发送计划。</Text></View><Switch checked={task.enabled} disabled={busy !== ''} color="#19bb79" onChange={(event) => onToggle(event.detail.value)} /></View></View><View className="task-detail-card"><View className="task-card-heading"><Text className="task-section-title">最近执行</Text><Button className="task-link-button" onClick={onHistory}>查看全部 ›</Button></View>{history.length === 0 ? <Text className="muted">暂未加载执行记录。</Text> : history.slice(0, 3).map((item) => <View className="task-mini-history" key={item.id}><Text className={`history-dot history-dot-${item.status}`} /><View><Text>{formatClock(item.scheduled_at)} <Text className={`task-history-status task-history-status-${item.status}`}>{historyLabel(item.status)}</Text></Text><Text className="muted">{item.error_code || '执行记录'}</Text></View></View>)}</View><View className="task-detail-actions"><Button className="task-primary-button" disabled={busy !== '' || !task.enabled} onClick={onRun}>{busy.startsWith('run:') ? '加入中…' : '↯ 立即执行'}</Button><Button className="task-secondary-button" disabled={busy !== ''} onClick={onEdit}>编辑任务</Button></View></View> }
function EditTask({ task, draft, busy, error, onBack, onDraftChange, onSave }: { task: Task; draft: Draft; busy: string; error: string; onBack: () => void; onDraftChange: (draft: Draft) => void; onSave: () => void }) { return <View className="mini-page task-page"><View className="task-detail-topbar"><Button className="task-back-button" onClick={onBack}>‹</Button><Text>编辑任务</Text><View className="task-topbar-spacer" /></View><View className="task-edit-card"><Text className="task-section-title">关联对象</Text><View className="task-edit-static"><Text>目标好友</Text><Text className="muted">任务对象不会在小程序内切换</Text></View><Text className="task-section-title task-edit-section">时间窗口</Text><View className="task-time-grid"><Input className="task-input-me" value={draft.windowStart} onInput={(event) => onDraftChange({ ...draft, windowStart: event.detail.value })} /><Text className="task-time-separator">～</Text><Input className="task-input-me" value={draft.windowEnd} onInput={(event) => onDraftChange({ ...draft, windowEnd: event.detail.value })} /></View><Text className="task-section-title task-edit-section">消息内容</Text><Textarea className="task-textarea-me" maxlength={500} value={draft.message} placeholder={task.message.kind === 'sticker' ? '输入贴纸 ID' : '请输入每日发送的消息'} onInput={(event) => onDraftChange({ ...draft, message: event.detail.value })} /><View className="task-detail-row-with-control task-first-message"><View><Text>允许首聊</Text><Text className="muted">仅在目标好友没有会话时尝试发送</Text></View><Switch checked={draft.allowFirstMessage} color="#19bb79" onChange={(event) => onDraftChange({ ...draft, allowFirstMessage: event.detail.value })} /></View>{error && <View className="task-inline-error"><Text>{error}</Text></View>}<Button className="task-primary-button" disabled={busy === 'save'} onClick={onSave}>{busy === 'save' ? '保存中…' : '保存任务'}</Button></View></View> }
function TaskHistory({ task, friend, history, onBack }: { task: Task; friend?: Friend; history: HistoryItem[]; onBack: () => void }) { return <View className="mini-page task-page"><View className="task-detail-topbar"><Button className="task-back-button" onClick={onBack}>‹</Button><Text>执行记录</Text><View className="task-topbar-spacer" /></View><View className="task-history-summary"><Text className="task-section-title">{friend?.display_name || '未命名好友'}</Text><Text className="muted">{task.window_start.slice(0, 5)} ～ {task.window_end.slice(0, 5)} · 最近记录</Text><View className="history-summary-grid"><Overview label="总执行" value={history.length} tone="blue" /><Overview label="成功" value={history.filter((item) => item.status === 'succeeded').length} tone="green" /><Overview label="需关注" value={history.filter((item) => ['failed', 'retry_wait'].includes(item.status)).length} tone="amber" /></View></View>{history.length === 0 ? <View className="task-empty-small"><Text className="task-empty-title">暂无执行记录</Text><Text className="muted">任务执行后，结果会显示在这里。</Text></View> : <View className="task-history-list">{history.map((item) => <View className="task-history-row" key={item.id}><View className={`history-dot history-dot-${item.status}`} /><View className="task-history-row-copy"><Text>{formatClock(item.scheduled_at)} <Text className={`task-history-status task-history-status-${item.status}`}>{historyLabel(item.status)}</Text></Text><Text className="muted">{item.error_code ? item.error_code : item.intent_type === 'manual' ? '手动执行' : '定时执行'}</Text></View><Text className="muted">{formatDay(item.scheduled_at)}</Text></View>)}</View>}</View> }
function Overview({ label, value, tone }: { label: string; value: number; tone: string }) { return <View className={`task-overview-item task-overview-${tone}`}><Text className={`task-overview-value task-overview-value-${tone}`}>{value}</Text><Text className="task-overview-label">{label}</Text></View> }
function DetailRow({ label, value, tone, multiline }: { label: string; value: string; tone?: string; multiline?: boolean }) { return <View className={`task-detail-row ${multiline ? 'task-detail-row-multiline' : ''}`}><Text className="muted">{label}</Text><Text className={tone ? `task-detail-value task-detail-${tone}` : 'task-detail-value'}>{value}</Text></View> }
function EmptyTasks({ onCreate }: { onCreate: () => void }) { return <View className="task-empty"><Image className="task-empty-image" src={taskChecklist} mode="aspectFit" /><Text className="task-empty-title">还没有任务</Text><Text className="muted">在 PC 端创建第一个火花任务，<br />小程序里即可随时启停和执行。</Text><Button className="task-primary-button" onClick={onCreate}>新建任务</Button></View> }
function GuestTasks() { return <View className="mini-page task-page"><View className="task-empty"><Image className="task-empty-image" src={taskChecklist} mode="aspectFit" /><Text className="task-empty-title">请先登录</Text><Text className="muted">登录后才能查看和管理任务。</Text><Button className="task-primary-button" onClick={() => Taro.switchTab({ url: '/pages/login/index' })}>去登录 / 绑定</Button></View></View> }
function TaskError({ message, onRetry }: { message: string; onRetry: () => void }) { return <View className="mini-page task-page"><View className="task-empty"><Text className="task-error-mark">!</Text><Text className="task-empty-title">任务暂时不可用</Text><Text className="muted">{message || '请检查网络后重试。'}</Text><Button className="task-secondary-button" onClick={onRetry}>重新加载</Button></View></View> }
function LoadingTasks() { return <View className="mini-page task-page"><View className="task-skeleton task-skeleton-header" /><View className="task-skeleton task-skeleton-tabs" /><View className="task-skeleton task-skeleton-card" /><View className="task-skeleton task-skeleton-card" /></View> }
function historyLabel(value: string) { return value === 'succeeded' ? '成功' : ['pending', 'queued', 'running', 'retry_wait'].includes(value) ? '进行中' : value === 'failed' ? '失败' : '跳过' }
function formatClock(value: string) { return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(new Date(value)) }
function formatDay(value: string) { return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(new Date(value)) }
