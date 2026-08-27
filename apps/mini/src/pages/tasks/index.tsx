import { useCallback, useEffect, useMemo, useState } from 'react'
import { Image, Input, Picker, Switch, Text, Textarea, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'

import { getAccessToken } from '@/lib/session'
import { createMessageTemplate, createTask, deleteMessageTemplate, deleteTask, getSendJob, listAccounts, listFriends, listMessageTemplates, listSendIntents, listTasks, MiniApiError, runTaskNow, updateMessageTemplate, updateTask } from '@/lib/api'
import { createIdempotencyKey } from '@/features/home/home-utils'
import { taskCreateDraftError, taskTargetCandidates, taskTimePayload, templatePickerIndex, uniqueSparkTargets } from '@/features/spark/spark-utils'
import taskChecklist from '@/assets/tasks/task-checklist.png'
import { MiniButton as Button } from '@/components/mini-button'

type Task = Awaited<ReturnType<typeof listTasks>>['items'][number]
type Account = Awaited<ReturnType<typeof listAccounts>>['items'][number]
type Friend = Awaited<ReturnType<typeof listFriends>>['items'][number]
type HistoryItem = Awaited<ReturnType<typeof listSendIntents>>['items'][number]
type MessageTemplate = Awaited<ReturnType<typeof listMessageTemplates>>['items'][number]
type Screen = 'list' | 'detail' | 'edit' | 'history' | 'create' | 'templates'
type Filter = 'all' | 'enabled' | 'paused'
type Draft = { windowStart: string; windowEnd: string; message: string; messageKind: 'text' | 'sticker'; allowFirstMessage: boolean }
type CreateDraft = Draft & { accountId: string; friendId: string; enabled: boolean }
type TemplateDraft = { id?: string; name: string; kind: 'text' | 'sticker'; body: string }

export default function Tasks() {
  const [state, setState] = useState<'loading' | 'guest' | 'ready' | 'error'>('loading')
  const [tasks, setTasks] = useState<Task[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [templates, setTemplates] = useState<MessageTemplate[]>([])
  const [friends, setFriends] = useState<Record<string, Friend>>({})
  const [friendsByAccount, setFriendsByAccount] = useState<Record<string, Friend[]>>({})
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [screen, setScreen] = useState<Screen>('list')
  const [selectedTaskId, setSelectedTaskId] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [createDraft, setCreateDraft] = useState<CreateDraft | null>(null)
  const [runJobId, setRunJobId] = useState('')
  const [runJobStatus, setRunJobStatus] = useState('')
  const [templateDraft, setTemplateDraft] = useState<TemplateDraft | null>(null)

  const load = useCallback(async () => {
    const token = getAccessToken()
    if (!token) {
      setState('guest')
      return
    }
    setState('loading')
    setError('')
    try {
      const [accountsResponse, tasksResponse, templatesResponse] = await Promise.all([listAccounts(token), listTasks(token), listMessageTemplates(token, { limit: 100 })])
      const friendResponses = await Promise.all(accountsResponse.items.map((account) => listFriends(token, account.id, { includeArchived: true })))
      const friendIndex: Record<string, Friend> = {}
      const friendGroups: Record<string, Friend[]> = {}
      friendResponses.forEach((response, index) => {
        const accountId = accountsResponse.items[index]?.id
        if (!accountId) return
        const taskTargets = uniqueSparkTargets(response.items)
        friendGroups[accountId] = taskTargets
        taskTargets.forEach((friend) => { friendIndex[friend.id] = friend })
      })
      setAccounts(accountsResponse.items)
      setTemplates(templatesResponse.items)
      setTasks(tasksResponse.items)
      setFriends(friendIndex)
      setFriendsByAccount(friendGroups)
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

  useDidShow(() => { void load() })

  useEffect(() => {
    const token = getAccessToken()
    if (!token || screen !== 'detail' || !selectedTaskId) return
    let active = true
    void listSendIntents(token, { task_id: selectedTaskId })
      .then((response) => { if (active) setHistory(response.items) })
      .catch(() => { if (active) setHistory([]) })
    return () => { active = false }
  }, [screen, selectedTaskId])

  useEffect(() => {
    if (!runJobId) return
    const token = getAccessToken()
    if (!token) {
      setRunJobId('')
      setRunJobStatus('')
      setBusy('')
      return
    }
    let active = true
    const poll = async () => {
      try {
        const job = await getSendJob(token, runJobId)
        if (!active) return
        setRunJobStatus(runStatusLabel(job.status))
        if (!['succeeded', 'failed', 'cancelled'].includes(job.status)) return
        setRunJobId('')
        setBusy('')
        if (job.status === 'succeeded') {
          if (selectedTaskId) {
            const latest = await listSendIntents(token, { task_id: selectedTaskId })
            if (active) setHistory(latest.items)
          }
          if (active) await Taro.showToast({ title: '任务执行完成', icon: 'success' })
        } else if (active) {
          setError(job.error_code || '任务执行失败，请查看执行记录。')
        }
      } catch (cause) {
        if (!active) return
        setRunJobId('')
        setRunJobStatus('')
        setBusy('')
        setError(cause instanceof Error ? cause.message : '任务状态查询失败')
      }
    }
    void poll()
    const timer = setInterval(() => void poll(), 2500)
    return () => { active = false; clearInterval(timer) }
  }, [runJobId, selectedTaskId])

  const visibleTasks = useMemo(() => filter === 'all' ? tasks : tasks.filter((task) => filter === 'enabled' ? task.enabled : !task.enabled), [filter, tasks])

  if (state === 'loading') return <LoadingTasks />
  if (state === 'guest') return <GuestTasks />
  if (state === 'error') return <TaskError message={error} onRetry={() => void load()} />
  if (screen === 'templates') return <TemplateManager templates={templates} draft={templateDraft} busy={busy} error={error} onBack={() => { setTemplateDraft(null); setScreen('list') }} onNew={() => { setError(''); setTemplateDraft({ name: '', kind: 'text', body: '' }) }} onEdit={(template) => { setError(''); setTemplateDraft({ id: template.id, name: template.name, kind: template.kind, body: template.body }) }} onDraftChange={setTemplateDraft} onSave={() => void saveTemplate()} onDelete={(template) => void removeTemplate(template)} />

  const selectedTask = tasks.find((task) => task.id === selectedTaskId)
  if (screen === 'edit' && selectedTask && draft) return <EditTask task={selectedTask} draft={draft} templates={templates} busy={busy} error={error} onBack={() => setScreen('detail')} onDraftChange={setDraft} onSave={() => void saveTask()} />
  if (screen === 'detail' && selectedTask) return <TaskDetail task={selectedTask} friend={friends[selectedTask.friend_id]} account={accounts.find((account) => account.id === selectedTask.account_id)} history={history} busy={busy} runJobStatus={runJobStatus} error={error} onBack={() => setScreen('list')} onEdit={() => openEdit(selectedTask)} onRun={() => void runTask(selectedTask)} onToggle={(enabled) => void toggleTask(selectedTask, enabled)} onHistory={() => void openHistory(selectedTask)} onDelete={() => void deleteCurrentTask(selectedTask)} />
  if (screen === 'history' && selectedTask) return <TaskHistory task={selectedTask} friend={friends[selectedTask.friend_id]} history={history} onBack={() => setScreen('detail')} />
  if (screen === 'create' && createDraft) return <CreateTask draft={createDraft} accounts={accounts} friendsByAccount={friendsByAccount} templates={templates} busy={busy} error={error} onBack={() => { setCreateDraft(null); setScreen('list') }} onDraftChange={setCreateDraft} onSave={() => void saveCreatedTask()} />

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
    setDraft({ windowStart: task.window_start.slice(0, 5), windowEnd: task.window_end.slice(0, 5), message: task.message.body || '', messageKind: task.message.kind, allowFirstMessage: task.allow_first_message ?? false })
    setSelectedTaskId(task.id)
    setScreen('edit')
  }

  function openCreate() {
    const account = accounts.find((item) => item.binding_status === 'bound' && taskTargetCandidates(friendsByAccount[item.id] ?? []).length > 0)
    const friend = account ? taskTargetCandidates(friendsByAccount[account.id] ?? [])[0] : undefined
    if (!account) {
      void Taro.showModal({ title: '请先绑定抖音账号', content: '绑定账号后，才能为会话创建火花任务。' })
      return
    }
    if (!friend) {
      void Taro.showModal({ title: '暂无可用会话', content: '请先同步会话，并等待会话身份确认后再创建任务。' })
      return
    }
    setError('')
    setCreateDraft({ accountId: account.id, friendId: friend.id, enabled: true, windowStart: '19:30', windowEnd: '22:30', message: '', messageKind: 'text', allowFirstMessage: false })
    setScreen('create')
  }

  function openTemplates() {
    setError('')
    setTemplateDraft(null)
    setScreen('templates')
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
      const updated = await updateTask(token, selectedTask.id, { window_start: taskTimePayload(draft.windowStart), window_end: taskTimePayload(draft.windowEnd), message: { kind: draft.messageKind, body: draft.message.trim() }, allow_first_message: draft.allowFirstMessage })
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

  async function saveCreatedTask() {
    const token = getAccessToken()
    if (!token || !createDraft || busy) return
    const validationError = taskCreateDraftError(createDraft.accountId, createDraft.friendId, createDraft.windowStart, createDraft.windowEnd, createDraft.message)
    if (validationError) {
      setError(validationError)
      return
    }
    setBusy('create')
    setError('')
    try {
      const created = await createTask(token, {
        account_id: createDraft.accountId,
        friend_id: createDraft.friendId,
        enabled: createDraft.enabled,
        timezone: 'Asia/Shanghai',
        window_start: taskTimePayload(createDraft.windowStart),
        window_end: taskTimePayload(createDraft.windowEnd),
        message: { kind: createDraft.messageKind, body: createDraft.message.trim() },
        allow_first_message: createDraft.allowFirstMessage,
      })
      setTasks((current) => [created, ...current])
      setSelectedTaskId(created.id)
      setCreateDraft(null)
      setScreen('detail')
      await Taro.showToast({ title: '任务已创建', icon: 'success' })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '任务创建失败')
    } finally {
      setBusy('')
    }
  }

  async function runTask(task: Task) {
    const token = getAccessToken()
    if (!token || busy) return
    setBusy(`run:${task.id}`)
    setError('')
    let queued = false
    try {
      const result = await runTaskNow(token, task.id, createIdempotencyKey())
      queued = true
      setRunJobId(result.job_id)
      setRunJobStatus(runStatusLabel(result.status))
      await Taro.showToast({ title: '已加入发送队列', icon: 'success' })
      setScreen('detail')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '立即执行失败，请稍后重试。')
    } finally {
      if (!queued) setBusy('')
    }
  }

  async function deleteCurrentTask(task: Task) {
    const token = getAccessToken()
    if (!token || busy) return
    const result = await Taro.showModal({ title: '删除任务？', content: `删除“${friends[task.friend_id]?.display_name || '未命名会话'}”的火花任务后，将不再执行后续计划。` })
    if (!result.confirm) return
    setBusy('delete')
    setError('')
    try {
      await deleteTask(token, task.id)
      setTasks((current) => current.filter((item) => item.id !== task.id))
      setHistory([])
      setSelectedTaskId('')
      setScreen('list')
      await Taro.showToast({ title: '任务已删除', icon: 'success' })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '删除任务失败')
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

  async function saveTemplate() {
    const token = getAccessToken()
    if (!token || !templateDraft || busy) return
    const name = templateDraft.name.trim()
    const body = templateDraft.body.trim()
    if (!name) {
      setError('请填写模板名称。')
      return
    }
    if (!body) {
      setError(templateDraft.kind === 'sticker' ? '请填写贴纸 ID。' : '请填写模板内容。')
      return
    }
    setBusy(templateDraft.id ? `template-save:${templateDraft.id}` : 'template-create')
    setError('')
    try {
      const saved = templateDraft.id
        ? await updateMessageTemplate(token, templateDraft.id, { name, kind: templateDraft.kind, body })
        : await createMessageTemplate(token, { name, kind: templateDraft.kind, body })
      setTemplates((current) => templateDraft.id ? current.map((item) => item.id === saved.id ? saved : item) : [saved, ...current])
      setTemplateDraft(null)
      await Taro.showToast({ title: templateDraft.id ? '模板已保存' : '模板已创建', icon: 'success' })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '模板保存失败')
    } finally {
      setBusy('')
    }
  }

  async function removeTemplate(template: MessageTemplate) {
    const token = getAccessToken()
    if (!token || busy) return
    const result = await Taro.showModal({ title: '删除模板？', content: `删除“${template.name}”后，已创建任务不受影响。` })
    if (!result.confirm) return
    setBusy(`template-delete:${template.id}`)
    setError('')
    try {
      await deleteMessageTemplate(token, template.id)
      setTemplates((current) => current.filter((item) => item.id !== template.id))
      await Taro.showToast({ title: '模板已删除', icon: 'success' })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '模板删除失败')
    } finally {
      setBusy('')
    }
  }

  return <View className="mini-page task-page"><View className="task-page-header"><View><Text className="task-page-kicker">Douyin Keeper</Text><Text className="task-page-title">任务</Text></View><View className="task-header-actions"><Button className="task-template-link" onClick={openTemplates}>模板</Button><Button className="task-new-button" onClick={openCreate}>+</Button></View></View><View className="task-filter-tabs">{([{ value: 'all', label: '全部' }, { value: 'enabled', label: '运行中' }, { value: 'paused', label: '已暂停' }] as const).map((item) => <Button key={item.value} className={filter === item.value ? 'task-filter-active' : ''} onClick={() => setFilter(item.value)}>{item.label}</Button>)}</View><View className="task-overview"><Overview label="运行中" value={tasks.filter((task) => task.enabled).length} tone="green" /><Overview label="已暂停" value={tasks.filter((task) => !task.enabled).length} tone="amber" /><Overview label="今日任务" value={tasks.length} tone="blue" /></View>{error && <View className="task-inline-error"><Text>{error}</Text></View>}{visibleTasks.length === 0 ? <EmptyTasks onCreate={openCreate} /> : <View>{visibleTasks.map((task) => <TaskCard key={task.id} task={task} friend={friends[task.friend_id]} account={accounts.find((account) => account.id === task.account_id)} busy={busy === task.id} onSelect={() => { setSelectedTaskId(task.id); setScreen('detail') }} onToggle={(enabled) => void toggleTask(task, enabled)} />)}</View>}</View>
}

function TemplateManager({ templates, draft, busy, error, onBack, onNew, onEdit, onDraftChange, onSave, onDelete }: { templates: MessageTemplate[]; draft: TemplateDraft | null; busy: string; error: string; onBack: () => void; onNew: () => void; onEdit: (template: MessageTemplate) => void; onDraftChange: (draft: TemplateDraft | null) => void; onSave: () => void; onDelete: (template: MessageTemplate) => void }) {
  if (draft) {
    const kindOptions = ['文字', '贴纸']
    const kindIndex = draft.kind === 'sticker' ? 1 : 0
    return <View className="mini-page task-page"><View className="task-detail-topbar"><Button className="task-back-button" onClick={() => onDraftChange(null)}>‹</Button><Text>{draft.id ? '编辑模板' : '新建模板'}</Text><View className="task-topbar-spacer" /></View><View className="task-template-card"><Text className="task-section-title">模板信息</Text><Text className="task-create-label">模板名称</Text><Input className="task-template-input" maxlength={80} value={draft.name} placeholder="例如：晚安问候" onInput={(event) => onDraftChange({ ...draft, name: event.detail.value })} /><Text className="task-create-label">消息类型</Text><Picker mode="selector" range={kindOptions} value={kindIndex} onChange={(event) => onDraftChange({ ...draft, kind: Number(event.detail.value) === 1 ? 'sticker' : 'text' })}><View className="task-picker-control"><Text>{kindOptions[kindIndex]}</Text><Text className="task-picker-arrow">›</Text></View></Picker><Text className="task-create-label">{draft.kind === 'sticker' ? '贴纸 ID' : '模板内容'}</Text><Textarea className="task-template-textarea" maxlength={500} value={draft.body} placeholder={draft.kind === 'sticker' ? '输入稳定 sticker_id' : '输入可复用的文字内容'} onInput={(event) => onDraftChange({ ...draft, body: event.detail.value })} />{error && <View className="task-inline-error"><Text>{error}</Text></View>}<Button className="task-primary-button" disabled={busy !== ''} onClick={onSave}>{busy ? '保存中…' : '保存模板'}</Button></View></View>
  }
  return <View className="mini-page task-page"><View className="task-detail-topbar"><Button className="task-back-button" onClick={onBack}>‹</Button><Text>消息模板</Text><Button className="task-template-add-button" onClick={onNew}>+ 新建</Button></View><Text className="task-template-caption">模板可以在创建任务时直接套用，保存为任务自己的内容快照。</Text>{error && <View className="task-inline-error"><Text>{error}</Text></View>}{templates.length === 0 ? <View className="task-empty-small"><Text className="task-empty-title">暂无消息模板</Text><Text className="muted">新建一个常用问候，之后创建任务时可以快速套用。</Text><Button className="task-primary-button" onClick={onNew}>新建模板</Button></View> : <View className="task-template-list">{templates.map((template) => <View className="task-template-card" key={template.id}><View className="task-template-heading"><View className="task-template-copy"><Text className="task-template-name">{template.name}</Text><Text className="task-template-kind">{template.kind === 'sticker' ? '贴纸' : '文字'}</Text></View><View className="task-template-actions"><Button className="task-template-action" disabled={busy !== ''} onClick={() => onEdit(template)}>编辑</Button><Button className="task-template-action task-template-delete" disabled={busy !== ''} onClick={() => onDelete(template)}>删除</Button></View></View><Text className="task-template-body">{template.body}</Text></View>)}</View>}</View>
}

function TaskCard({ task, friend, account, busy, onSelect, onToggle }: { task: Task; friend?: Friend; account?: Account; busy: boolean; onSelect: () => void; onToggle: (enabled: boolean) => void }) { return <View className="task-card" onClick={onSelect}><View className="task-card-heading"><View className="task-card-copy"><Text className="task-card-name">{friend?.display_name || '未命名会话'}</Text><Text className="muted">关联账号：{account?.nickname || '未命名账号'}</Text></View><Text className={`task-status task-status-${task.enabled ? 'running' : 'paused'}`}>{task.enabled ? '运行中' : '已暂停'}</Text></View><View className="task-card-row"><Text className="task-row-label">时间窗口</Text><Text className="task-row-value">{task.window_start.slice(0, 5)} ～ {task.window_end.slice(0, 5)}</Text></View><View className="task-card-row"><Text className="task-row-label">消息内容</Text><Text className="task-message-preview">{task.message.body || (task.message.kind === 'sticker' ? '贴纸消息' : '未填写消息')}</Text></View><View className="task-card-bottom"><Text className="task-last-result">每日一次 · {task.timezone}</Text><Switch onClick={(event) => event.stopPropagation()} checked={task.enabled} disabled={busy} color="#19bb79" onChange={(event) => onToggle(event.detail.value)} /></View></View> }
function CreateTask({ draft, accounts, friendsByAccount, templates, busy, error, onBack, onDraftChange, onSave }: { draft: CreateDraft; accounts: Account[]; friendsByAccount: Record<string, Friend[]>; templates: MessageTemplate[]; busy: string; error: string; onBack: () => void; onDraftChange: (draft: CreateDraft) => void; onSave: () => void }) {
  const selectableAccounts = accounts.filter((account) => account.binding_status === 'bound' && taskTargetCandidates(friendsByAccount[account.id] ?? []).length > 0)
  const accountOptions = selectableAccounts.map((account) => account.nickname || '未命名账号')
  const accountIndex = Math.max(0, selectableAccounts.findIndex((account) => account.id === draft.accountId))
  const selectedAccount = selectableAccounts[accountIndex]
  const availableFriends = taskTargetCandidates(selectedAccount ? friendsByAccount[selectedAccount.id] ?? [] : [])
  const friendOptions = availableFriends.map((friend) => friend.nickname || friend.display_name)
  const friendIndex = Math.max(0, availableFriends.findIndex((friend) => friend.id === draft.friendId))
  const selectedFriend = availableFriends[friendIndex]

  return <View className="mini-page task-page"><View className="task-detail-topbar"><Button className="task-back-button" onClick={onBack}>‹</Button><Text>新建任务</Text><View className="task-topbar-spacer" /></View><View className="task-create-card"><Text className="task-section-title">任务对象</Text><Text className="task-create-caption">仅可选择已绑定账号下、未归档且身份已确认的会话。</Text><Text className="task-create-label">抖音账号</Text><Picker mode="selector" range={accountOptions} value={accountIndex} onChange={(event) => { const nextAccount = selectableAccounts[Number(event.detail.value)]; const nextFriend = nextAccount ? taskTargetCandidates(friendsByAccount[nextAccount.id] ?? [])[0] : undefined; onDraftChange({ ...draft, accountId: nextAccount?.id ?? '', friendId: nextFriend?.id ?? '' }) }}><View className="task-picker-control"><Text>{selectedAccount?.nickname || '请选择账号'}</Text><Text className="task-picker-arrow">›</Text></View></Picker><Text className="task-create-label">目标会话</Text>{friendOptions.length === 0 ? <View className="task-picker-empty"><Text>当前账号没有可创建任务的会话</Text><Text className="muted">请先同步会话，并等待身份确认后再创建任务。</Text></View> : <Picker mode="selector" range={friendOptions} value={friendIndex} onChange={(event) => { const nextFriend = availableFriends[Number(event.detail.value)]; onDraftChange({ ...draft, friendId: nextFriend?.id ?? '' }) }}><View className="task-picker-control"><Text>{selectedFriend?.nickname || selectedFriend?.display_name || '请选择会话'}</Text><Text className="task-picker-arrow">›</Text></View></Picker>}<Text className="task-section-title task-edit-section">发送时间</Text><View className="task-time-grid"><Input className="task-input-me" value={draft.windowStart} onInput={(event) => onDraftChange({ ...draft, windowStart: event.detail.value })} placeholder="19:30" /><Text className="task-time-separator">～</Text><Input className="task-input-me" value={draft.windowEnd} onInput={(event) => onDraftChange({ ...draft, windowEnd: event.detail.value })} placeholder="22:30" /></View><Text className="task-section-title task-edit-section">消息内容</Text>{templates.length > 0 && <TemplatePicker templates={templates} selectedKind={draft.messageKind} selectedBody={draft.message} onSelect={(template) => onDraftChange({ ...draft, messageKind: template.kind, message: template.body })} />}<Textarea className="task-textarea-me" maxlength={500} value={draft.message} placeholder={draft.messageKind === 'sticker' ? '请输入贴纸 ID' : '请输入每日发送的文字'} onInput={(event) => onDraftChange({ ...draft, message: event.detail.value })} /><View className="task-detail-row-with-control task-first-message"><View><Text>允许首聊</Text><Text className="muted">目标会话没有历史消息时才尝试发送。</Text></View><Switch checked={draft.allowFirstMessage} color="#19bb79" onChange={(event) => onDraftChange({ ...draft, allowFirstMessage: event.detail.value })} /></View><View className="task-detail-row-with-control task-first-message"><View><Text>创建后立即启用</Text><Text className="muted">任务会进入每日发送计划。</Text></View><Switch checked={draft.enabled} color="#19bb79" onChange={(event) => onDraftChange({ ...draft, enabled: event.detail.value })} /></View>{error && <View className="task-inline-error"><Text>{error}</Text></View>}<Button className="task-primary-button" disabled={busy === 'create' || !selectedFriend} onClick={onSave}>{busy === 'create' ? '创建中…' : '创建任务'}</Button></View></View>
}
function TaskDetail({ task, friend, account, history, busy, runJobStatus, error, onBack, onEdit, onRun, onToggle, onHistory, onDelete }: { task: Task; friend?: Friend; account?: Account; history: HistoryItem[]; busy: string; runJobStatus: string; error: string; onBack: () => void; onEdit: () => void; onRun: () => void; onToggle: (enabled: boolean) => void; onHistory: () => void; onDelete: () => void }) { return <View className="mini-page task-page"><View className="task-detail-topbar"><Button className="task-back-button" onClick={onBack}>‹</Button><Text>任务详情</Text><View className="task-topbar-spacer" /></View><View className="task-detail-hero"><View className="task-detail-avatar"><Text>{(friend?.display_name || '会').slice(0, 1)}</Text></View><View className="task-detail-copy"><Text className="task-detail-name">{friend?.display_name || '未命名会话'}</Text><Text className="muted">关联账号：{account?.nickname || '未命名账号'}</Text></View><Text className={`task-status task-status-${task.enabled ? 'running' : 'paused'}`}>{task.enabled ? '运行中' : '已暂停'}</Text></View>{runJobStatus && <View className="task-operation-status"><Text>立即执行：{runJobStatus}</Text></View>}{error && <View className="task-inline-error"><Text>{error}</Text></View>}<View className="task-detail-card"><DetailRow label="时间窗口" value={`${task.window_start.slice(0, 5)} ～ ${task.window_end.slice(0, 5)}`} /><DetailRow label="消息类型" value={task.message.kind === 'sticker' ? '贴纸消息' : '私信消息'} /><DetailRow label="消息内容" value={task.message.body || '未填写消息'} multiline /><DetailRow label="允许首聊" value={task.allow_first_message ? '允许' : '不允许'} tone={task.allow_first_message ? 'green' : undefined} /></View><View className="task-detail-card"><View className="task-detail-row-with-control"><View><Text className="task-section-title">启用状态</Text><Text className="muted">停用后不会再进入每日发送计划。</Text></View><Switch checked={task.enabled} disabled={busy !== ''} color="#19bb79" onChange={(event) => onToggle(event.detail.value)} /></View></View><View className="task-detail-card"><View className="task-card-heading"><Text className="task-section-title">最近执行</Text><Button className="task-link-button" onClick={onHistory}>查看全部 ›</Button></View>{history.length === 0 ? <Text className="muted">暂未加载执行记录。</Text> : history.slice(0, 3).map((item) => <View className="task-mini-history" key={item.id}><Text className={`history-dot history-dot-${item.status}`} /><View><Text>{formatClock(item.scheduled_at)} <Text className={`task-history-status task-history-status-${item.status}`}>{historyLabel(item.status)}</Text></Text><Text className="muted">{item.error_code || '执行记录'}</Text></View></View>)}</View><View className="task-detail-actions"><Button className="task-primary-button" disabled={busy !== '' || !task.enabled} onClick={onRun}>{busy.startsWith('run:') ? '执行中…' : '↯ 立即执行'}</Button><Button className="task-secondary-button" disabled={busy !== ''} onClick={onEdit}>编辑任务</Button><Button className="task-danger-button" disabled={busy !== ''} onClick={onDelete}>{busy === 'delete' ? '删除中…' : '删除任务'}</Button></View></View> }
function EditTask({ task, draft, templates, busy, error, onBack, onDraftChange, onSave }: { task: Task; draft: Draft; templates: MessageTemplate[]; busy: string; error: string; onBack: () => void; onDraftChange: (draft: Draft) => void; onSave: () => void }) { return <View className="mini-page task-page"><View className="task-detail-topbar"><Button className="task-back-button" onClick={onBack}>‹</Button><Text>编辑任务</Text><View className="task-topbar-spacer" /></View><View className="task-edit-card"><Text className="task-section-title">关联对象</Text><View className="task-edit-static"><Text>目标会话</Text><Text className="muted">任务对象不会在小程序内切换</Text></View><Text className="task-section-title task-edit-section">时间窗口</Text><View className="task-time-grid"><Input className="task-input-me" value={draft.windowStart} onInput={(event) => onDraftChange({ ...draft, windowStart: event.detail.value })} /><Text className="task-time-separator">～</Text><Input className="task-input-me" value={draft.windowEnd} onInput={(event) => onDraftChange({ ...draft, windowEnd: event.detail.value })} /></View><Text className="task-section-title task-edit-section">消息内容</Text>{templates.length > 0 && <TemplatePicker templates={templates} selectedKind={draft.messageKind} selectedBody={draft.message} onSelect={(template) => onDraftChange({ ...draft, messageKind: template.kind, message: template.body })} />}<Textarea className="task-textarea-me" maxlength={500} value={draft.message} placeholder={draft.messageKind === 'sticker' ? '输入贴纸 ID' : '请输入每日发送的消息'} onInput={(event) => onDraftChange({ ...draft, message: event.detail.value })} /><View className="task-detail-row-with-control task-first-message"><View><Text>允许首聊</Text><Text className="muted">仅在目标会话没有历史消息时尝试发送</Text></View><Switch checked={draft.allowFirstMessage} color="#19bb79" onChange={(event) => onDraftChange({ ...draft, allowFirstMessage: event.detail.value })} /></View>{error && <View className="task-inline-error"><Text>{error}</Text></View>}<Button className="task-primary-button" disabled={busy === 'save'} onClick={onSave}>{busy === 'save' ? '保存中…' : '保存任务'}</Button></View></View> }

function TemplatePicker({ templates, selectedKind, selectedBody, onSelect }: { templates: MessageTemplate[]; selectedKind: 'text' | 'sticker'; selectedBody: string; onSelect: (template: MessageTemplate) => void }) {
  const labels = ['选择模板，将内容复制到任务', ...templates.map((template) => `${template.name} · ${template.kind === 'sticker' ? '贴纸' : '文字'}`)]
  const selectedIndex = templatePickerIndex(templates, selectedKind, selectedBody)
  return <View className="task-template-picker"><Text className="task-create-label">从模板套用</Text><Picker mode="selector" range={labels} value={selectedIndex} onChange={(event) => { const template = templates[Number(event.detail.value) - 1]; if (template) onSelect(template) }}><View className="task-picker-control"><Text>{labels[selectedIndex]}</Text><Text className="task-picker-arrow">›</Text></View></Picker><Text className="muted">套用后仍可继续编辑，任务保存当前内容快照。</Text></View>
}
function TaskHistory({ task, friend, history, onBack }: { task: Task; friend?: Friend; history: HistoryItem[]; onBack: () => void }) { return <View className="mini-page task-page"><View className="task-detail-topbar"><Button className="task-back-button" onClick={onBack}>‹</Button><Text>执行记录</Text><View className="task-topbar-spacer" /></View><View className="task-history-summary"><Text className="task-section-title">{friend?.display_name || '未命名会话'}</Text><Text className="muted">{task.window_start.slice(0, 5)} ～ {task.window_end.slice(0, 5)} · 最近记录</Text><View className="history-summary-grid"><Overview label="总执行" value={history.length} tone="blue" /><Overview label="成功" value={history.filter((item) => item.status === 'succeeded').length} tone="green" /><Overview label="需关注" value={history.filter((item) => ['failed', 'retry_wait'].includes(item.status)).length} tone="amber" /></View></View>{history.length === 0 ? <View className="task-empty-small"><Text className="task-empty-title">暂无执行记录</Text><Text className="muted">任务执行后，结果会显示在这里。</Text></View> : <View className="task-history-list">{history.map((item) => <View className="task-history-row" key={item.id}><View className={`history-dot history-dot-${item.status}`} /><View className="task-history-row-copy"><Text>{formatClock(item.scheduled_at)} <Text className={`task-history-status task-history-status-${item.status}`}>{historyLabel(item.status)}</Text></Text><Text className="muted">{item.error_code ? item.error_code : item.intent_type === 'manual' ? '手动执行' : '定时执行'}</Text></View><Text className="muted">{formatDay(item.scheduled_at)}</Text></View>)}</View>}</View> }
function Overview({ label, value, tone }: { label: string; value: number; tone: string }) { return <View className={`task-overview-item task-overview-${tone}`}><Text className={`task-overview-value task-overview-value-${tone}`}>{value}</Text><Text className="task-overview-label">{label}</Text></View> }
function DetailRow({ label, value, tone, multiline }: { label: string; value: string; tone?: string; multiline?: boolean }) { return <View className={`task-detail-row ${multiline ? 'task-detail-row-multiline' : ''}`}><Text className="muted">{label}</Text><Text className={tone ? `task-detail-value task-detail-${tone}` : 'task-detail-value'}>{value}</Text></View> }
function EmptyTasks({ onCreate }: { onCreate: () => void }) { return <View className="task-empty"><Image className="task-empty-image" src={taskChecklist} mode="aspectFit" /><Text className="task-empty-title">还没有任务</Text><Text className="muted">在这里创建第一个火花任务，<br />之后即可随时启停和执行。</Text><Button className="task-primary-button" onClick={onCreate}>新建任务</Button></View> }
function GuestTasks() { return <View className="mini-page task-page"><View className="task-empty"><Image className="task-empty-image" src={taskChecklist} mode="aspectFit" /><Text className="task-empty-title">请先登录</Text><Text className="muted">登录后才能查看和管理任务。</Text><Button className="task-primary-button" onClick={() => Taro.switchTab({ url: '/pages/login/index' })}>去登录 / 绑定</Button></View></View> }
function TaskError({ message, onRetry }: { message: string; onRetry: () => void }) { return <View className="mini-page task-page"><View className="task-empty"><Text className="task-error-mark">!</Text><Text className="task-empty-title">任务暂时不可用</Text><Text className="muted">{message || '请检查网络后重试。'}</Text><Button className="task-secondary-button" onClick={onRetry}>重新加载</Button></View></View> }
function LoadingTasks() { return <View className="mini-page task-page"><View className="task-skeleton task-skeleton-header" /><View className="task-skeleton task-skeleton-tabs" /><View className="task-skeleton task-skeleton-card" /><View className="task-skeleton task-skeleton-card" /></View> }
function runStatusLabel(value: string) { return value === 'queued' ? '排队中' : value === 'running' ? '执行中' : value === 'succeeded' ? '已完成' : value === 'failed' ? '执行失败' : value === 'cancelled' ? '已取消' : '处理中' }
function historyLabel(value: string) { return value === 'succeeded' ? '成功' : ['pending', 'queued', 'running', 'retry_wait'].includes(value) ? '进行中' : value === 'failed' ? '失败' : '跳过' }
function formatClock(value: string) { return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(new Date(value)) }
function formatDay(value: string) { return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(new Date(value)) }
