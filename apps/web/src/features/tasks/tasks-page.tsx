import { useMemo, useState } from 'react'
import { useInfiniteQuery, useQueries, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { toast } from 'sonner'
import { createTask, deleteTask, getSendJob, listMessageTemplates, listTasks, runTaskNow, updateTask } from '@douyin-keeper/sdk-ts'
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label, Skeleton } from '@douyin-keeper/ui-web'
import { Filter, Plus, Search } from 'lucide-react'

import { getToken } from '@/auth/session'
import { listAllConversationsForAccount, type Conversation } from '../conversations/conversation-pagination'
import { TaskEditorDrawer } from './task-editor-drawer'
import { TaskTable } from './task-table'
import type { Account, MessageTemplate, Task, TaskDraft } from './task-types'
import { getTaskPageState } from './task-page-state'
import { useAccountsQuery } from '../accounts/use-accounts-query'
import { SelectField } from '@/components/select-field'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { selectableTaskConversations } from './task-targets'
import { waitForSendJobResult } from './task-send-status'
import { jobErrorMessage, jobErrorMessageFromError } from '@/lib/job-error-message'

export function TasksPage() {
  const token = getToken()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [accountFilter, setAccountFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'enabled' | 'disabled'>('all')
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null)
  const [editor, setEditor] = useState<{ draft: TaskDraft; mode: 'create' | 'edit' } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null)
  const [runTarget, setRunTarget] = useState<Task | null>(null)

  const accountsQ = useAccountsQuery(token, { loadAll: true })
  const accounts = accountsQ.accounts
  const tasksQ = useInfiniteQuery({
    queryKey: ['tasks'],
    queryFn: ({ pageParam }) => listTasks(token as string, { limit: 50, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage?.next_cursor ?? undefined,
    enabled: !!token,
  })
  const templatesQ = useInfiniteQuery({
    queryKey: ['message-templates'],
    queryFn: ({ pageParam }) => listMessageTemplates(token as string, { limit: 50, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage?.next_cursor ?? undefined,
    enabled: !!token,
  })
  const tasks = tasksQ.data?.pages.flatMap((page) => page.items) ?? []
  const conversationQueries = useQueries({
    queries: accounts.map((account) => ({
      queryKey: ['task-conversations', account.id],
      queryFn: () => listAllConversationsForAccount(token as string, account.id),
      enabled: !!token,
    })),
  })
  const conversationsByFriend = useMemo(() => {
    const index = new Map<string, Conversation>()
    conversationQueries.forEach((query) => query.data?.forEach((conversation) => {
      if (conversation.friend_id) index.set(conversation.friend_id, conversation)
    }))
    return index
  }, [conversationQueries])
  const conversationsByAccount = useMemo(() => {
    const result = new Map<string, Conversation[]>()
    accounts.forEach((account, index) => result.set(account.id, conversationQueries[index]?.data ?? []))
    return result
  }, [accounts, conversationQueries])
  const conversationsLoading = conversationQueries.some((query) => query.isPending)

  const visibleTasks = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('zh-CN')
    return tasks.filter((task) => {
      if (accountFilter !== 'all' && task.account_id !== accountFilter) return false
      if (statusFilter === 'enabled' && !task.enabled) return false
      if (statusFilter === 'disabled' && task.enabled) return false
      if (!query) return true
      const account = accounts.find((item) => item.id === task.account_id)
      const conversation = conversationsByFriend.get(task.friend_id)
      return [account?.nickname, conversation?.friend_nickname, conversation?.friend_display_name, task.message.body ?? '']
        .some((value) => (value ?? '').toLocaleLowerCase('zh-CN').includes(query))
    })
  }, [accountFilter, accounts, conversationsByFriend, search, statusFilter, tasks])

  const enabledCount = tasks.filter((task) => task.enabled).length
  const selectableConversationsByAccount = useMemo(() => {
    const result = new Map<string, Conversation[]>()
    conversationsByAccount.forEach((items, accountId) => result.set(accountId, selectableTaskConversations(items)))
    return result
  }, [conversationsByAccount])
  const templates: MessageTemplate[] = templatesQ.data?.pages.flatMap((page) => page.items) ?? []
  const pageState = getTaskPageState({
    accountsLoading: accountsQ.isLoading,
    accountsError: accountsQ.isError,
    tasksLoading: tasksQ.isLoading,
    tasksError: tasksQ.isError,
    accountCount: accounts.length,
  })

  function openCreate() {
    const account = accounts.find((item) => item.binding_status === 'bound' && selectableConversationsByAccount.get(item.id)?.length)
    const conversation = account ? selectableConversationsByAccount.get(account.id)?.[0] : undefined
    if (!account || !conversation) {
      toast.error('请先在会话列表开启一个火花维护会话')
      return
    }
    setEditor({ mode: 'create', draft: { accountId: account.id, conversationId: conversation.id, enabled: true, timezone: 'Asia/Shanghai', windowStart: '19:30', windowEnd: '22:30', messageKind: 'text', message: '', allowFirstMessage: false } })
  }

  function openEdit(task: Task) {
    const conversation = conversationsByAccount.get(task.account_id)?.find((item) => item.friend_id === task.friend_id)
    setEditor({ mode: 'edit', draft: { id: task.id, accountId: task.account_id, conversationId: conversation?.id ?? task.friend_id, enabled: task.enabled, timezone: task.timezone, windowStart: task.window_start.slice(0, 5), windowEnd: task.window_end.slice(0, 5), messageKind: task.message.kind, message: task.message.body ?? '', allowFirstMessage: task.allow_first_message ?? false } })
  }

  function changeEditorAccount(accountId: string) {
    const conversation = selectableConversationsByAccount.get(accountId)?.[0]
    setEditor((current) => current ? { ...current, draft: { ...current.draft, accountId, conversationId: conversation?.id ?? '' } } : current)
  }

  function applyTemplate(templateId: string) {
    const template = templates.find((item) => item.id === templateId)
    if (!template) return
    setEditor((current) => current ? { ...current, draft: { ...current.draft, messageKind: template.kind, message: template.body } } : current)
    toast.success(`已套用模板“${template.name}”`)
  }

  async function saveTask() {
    if (!token || !editor) return
    const { draft } = editor
    const targetConversation = conversationsByAccount.get(draft.accountId)?.find((conversation) => conversation.id === draft.conversationId)
    if (!targetConversation?.friend_id) { toast.error('会话身份尚未同步完成，请先重新同步会话'); return }
    if (!draft.windowStart || !draft.windowEnd) { toast.error('请选择完整的发送时间窗口'); return }
    if (!draft.message.trim()) { toast.error(draft.messageKind === 'sticker' ? '请填写贴纸 ID' : '请填写消息内容'); return }
    if (draft.windowStart >= draft.windowEnd) { toast.error('结束时间必须晚于开始时间'); return }
    setBusyTaskId(draft.id ?? 'new')
    const body = { enabled: draft.enabled, timezone: draft.timezone, window_start: `${draft.windowStart}:00`, window_end: `${draft.windowEnd}:00`, message: { kind: draft.messageKind, body: draft.message.trim() }, allow_first_message: draft.allowFirstMessage }
    try {
      if (editor.mode === 'create') await createTask(token, { ...body, account_id: draft.accountId, friend_id: targetConversation.friend_id })
      else await updateTask(token, draft.id!, body)
      await queryClient.invalidateQueries({ queryKey: ['tasks'] })
      setEditor(null)
      toast.success(editor.mode === 'create' ? '任务已创建' : '任务已保存')
    } catch (error) {
      toast.error(jobErrorMessageFromError(error, '保存任务失败，请检查任务内容后重试。'))
    } finally {
      setBusyTaskId(null)
    }
  }

  async function toggleTask(task: Task, enabled: boolean) {
    if (!token) return
    setBusyTaskId(task.id)
    try {
      await updateTask(token, task.id, { enabled })
      await queryClient.invalidateQueries({ queryKey: ['tasks'] })
      toast.success(enabled ? '任务已启用' : '任务已停用')
    } catch (error) {
      toast.error(jobErrorMessageFromError(error, '更新任务失败，请稍后再试。'))
    } finally { setBusyTaskId(null) }
  }

  async function runTask(task: Task) {
    if (!token) return
    const conversation = conversationsByFriend.get(task.friend_id)
    if (!conversation || conversation.archived) {
      setRunTarget(null)
      toast.error(jobErrorMessage('CONVERSATION_NOT_FOUND'), { duration: 10_000 })
      return
    }
    const toastId = `task-send-${task.id}`
    setBusyTaskId(task.id)
    try {
      const queued = await runTaskNow(token, task.id)
      setRunTarget(null)
      toast.loading('正在连接抖音并发送消息…', { id: toastId })
      const job = await waitForSendJobResult(() => getSendJob(token, queued.job_id))
      if (!job) {
        toast.info('发送仍在后台处理，请到“发送记录”查看最终结果。', { id: toastId, duration: 8_000 })
      } else if (job.status === 'succeeded') {
        toast.success('消息已发送，并已在抖音会话中确认。', { id: toastId })
      } else {
        toast.error(jobErrorMessage(job.error_code, job.status === 'cancelled' ? '发送任务已取消，消息没有发送。' : undefined), { id: toastId, duration: 12_000 })
      }
      await queryClient.invalidateQueries({ queryKey: ['send-intents'] })
    } catch (error) {
      toast.error(jobErrorMessageFromError(error, '无法开始发送，请稍后再试。'), { id: toastId, duration: 10_000 })
    } finally {
      setBusyTaskId(null)
      setRunTarget(null)
    }
  }

  async function removeTask() {
    if (!token || !deleteTarget) return
    setBusyTaskId(deleteTarget.id)
    try {
      await deleteTask(token, deleteTarget.id)
      await queryClient.invalidateQueries({ queryKey: ['tasks'] })
      setDeleteTarget(null)
      toast.success('任务已删除')
    } catch (error) {
      toast.error(jobErrorMessageFromError(error, '删除任务失败，请稍后再试。'))
    } finally { setBusyTaskId(null) }
  }

  if (pageState === 'loading') return <div className="space-y-6"><Skeleton className="h-20 w-full" /><Skeleton className="h-72 w-full" /></div>
  if (pageState === 'accounts-error') return <TaskDataError title="账号数据暂时不可用" description="无法确认当前账号，暂时不能安全地配置任务。" onRetry={() => { void Promise.all([accountsQ.refetch(), tasksQ.refetch()]) }} />
  if (pageState === 'empty') return <Card><CardHeader><CardTitle>任务</CardTitle><CardDescription>先绑定抖音账号，再配置火花任务。</CardDescription></CardHeader><CardContent><Button asChild><Link to="/accounts">前往绑定账号</Link></Button></CardContent></Card>

  const editorConversations = editor
    ? selectableTaskConversations(
      conversationsByAccount.get(editor.draft.accountId) ?? [],
        editor.mode === 'edit' ? editor.draft.conversationId : undefined,
      )
    : []
  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div><h1 className="text-2xl font-semibold tracking-tight">任务</h1><p className="mt-1 text-sm text-muted-foreground">为已开启火花维护的会话设置每日发送时间窗口和消息。</p></div>
        <Button onClick={openCreate} disabled={conversationsLoading}><Plus />{conversationsLoading ? '加载会话中…' : '新建任务'}</Button>
      </div>
      <Card><CardContent className="grid gap-4 p-5 sm:grid-cols-3"><div><div className="text-xs text-muted-foreground">任务总数</div><div className="mt-1 text-xl font-semibold">{tasks.length}</div></div><div><div className="text-xs text-muted-foreground">每日启用</div><div className="mt-1 text-xl font-semibold text-primary">{enabledCount}</div></div><div><div className="text-xs text-muted-foreground">当前筛选</div><div className="mt-1 text-xl font-semibold">{visibleTasks.length}</div></div></CardContent></Card>
      <Card>
        <CardHeader><div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end"><div><CardTitle>火花任务</CardTitle><CardDescription>{visibleTasks.length === tasks.length ? `共 ${tasks.length} 个任务` : `筛选出 ${visibleTasks.length} / ${tasks.length} 个任务`}</CardDescription></div><div className="flex items-center gap-2 text-xs text-muted-foreground"><Filter className="size-4" />保存后配置生效</div></div></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[minmax(200px,1fr)_repeat(2,minmax(150px,220px))]"><div className="space-y-1.5"><Label htmlFor="task-search">搜索任务</Label><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input id="task-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="账号、会话或消息内容" className="pl-9" /></div></div><FilterSelect label="账号" value={accountFilter} onChange={setAccountFilter} options={[{ value: 'all', label: '全部账号' }, ...accounts.map((account) => ({ value: account.id, label: account.nickname || '未命名账号' }))]} /><FilterSelect label="状态" value={statusFilter} onChange={(value) => setStatusFilter(value as 'all' | 'enabled' | 'disabled')} options={[{ value: 'all', label: '全部状态' }, { value: 'enabled', label: '每日启用' }, { value: 'disabled', label: '已停用' }]} /></div>
          {pageState === 'tasks-error' ? <TaskDataError title="任务列表暂时不可用" description="请重试加载任务；现有账号数据不会受到影响。" onRetry={() => void tasksQ.refetch()} /> : visibleTasks.length ? <TaskTable tasks={visibleTasks} accounts={accounts} conversations={conversationsByFriend} busyTaskId={busyTaskId} onToggle={(task, enabled) => void toggleTask(task, enabled)} onEdit={openEdit} onRun={setRunTarget} onDelete={setDeleteTarget} /> : <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-12 text-center"><p className="font-medium">{tasks.length ? '没有符合条件的任务' : '还没有火花任务'}</p><p className="mt-1 text-sm text-muted-foreground">{tasks.length ? '尝试清除筛选条件。' : '为已开启火花维护的会话创建第一个每日任务。'}</p>{!tasks.length && <Button className="mt-4" variant="outline" onClick={openCreate}>创建任务</Button>}</div>}
          {tasksQ.hasNextPage ? <div className="flex justify-center"><Button variant="outline" onClick={() => void tasksQ.fetchNextPage()} disabled={tasksQ.isFetchingNextPage}>{tasksQ.isFetchingNextPage ? '加载中…' : '加载更多任务'}</Button></div> : null}
        </CardContent>
      </Card>
      {editor && <TaskEditorDrawer draft={editor.draft} accounts={accounts} conversations={editorConversations} templates={templates} templatesHasNextPage={templatesQ.hasNextPage} templatesLoadingMore={templatesQ.isFetchingNextPage} onTemplatesLoadMore={() => void templatesQ.fetchNextPage()} saving={busyTaskId === (editor.draft.id ?? 'new')} onChange={(patch) => setEditor((current) => current ? { ...current, draft: { ...current.draft, ...patch } } : current)} onAccountChange={changeEditorAccount} onTemplateApply={applyTemplate} onClose={() => setEditor(null)} onSave={() => void saveTask()} />}
      <ConfirmDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open && !busyTaskId) setDeleteTarget(null) }} title="删除火花任务？" description="删除后，这个任务的发送配置将不再保留，需要重新创建。" impact="正在执行或等待执行的任务也会停止，不会影响抖音账号和会话数据。" confirmLabel="删除任务" confirmVariant="destructive" pending={busyTaskId === deleteTarget?.id} onConfirm={() => void removeTask()} />
      <ConfirmDialog open={!!runTarget} onOpenChange={(open) => { if (!open && !busyTaskId) setRunTarget(null) }} title="确认发送一次消息？" description={runTarget ? `将向“${conversationsByFriend.get(runTarget.friend_id)?.friend_nickname || conversationsByFriend.get(runTarget.friend_id)?.friend_display_name || '会话'}”发送：${runTarget.message.body || (runTarget.message.kind === 'sticker' ? '贴纸消息' : '未填写内容')}` : '确认立即执行这条任务吗？'} impact="这会真实调用抖音发送消息，发送后无法撤回。发送前系统仍会再次校验会话身份、账号状态和发送权益。" confirmLabel="确认发送" pending={busyTaskId === runTarget?.id} onConfirm={() => { if (runTarget) void runTask(runTarget) }} />
    </div>
  )
}

function TaskDataError({ title, description, onRetry }: { title: string; description: string; onRetry: () => void }) {
  return <Card className="border-destructive/30"><CardHeader><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader><CardContent><Button variant="outline" onClick={onRetry}>重试</Button></CardContent></Card>
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[] }) {
  const id = `task-filter-${label}`
  return <SelectField id={id} label={label} value={value} onChange={onChange} options={options} />
}
