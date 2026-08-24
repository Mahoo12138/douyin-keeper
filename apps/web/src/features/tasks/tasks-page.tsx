import { useMemo, useState } from 'react'
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { toast } from 'sonner'
import { createTask, deleteTask, listAccounts, listFriends, listTasks, runTaskNow, updateTask } from '@douyin-keeper/sdk-ts'
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label, Skeleton } from '@douyin-keeper/ui-web'
import { Filter, Plus, Search } from 'lucide-react'

import { getToken } from '@/auth/session'
import { TaskEditorDrawer } from './task-editor-drawer'
import { TaskTable } from './task-table'
import type { Account, Friend, Task, TaskDraft } from './task-types'

export function TasksPage() {
  const token = getToken()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [accountFilter, setAccountFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'enabled' | 'disabled'>('all')
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null)
  const [editor, setEditor] = useState<{ draft: TaskDraft; mode: 'create' | 'edit' } | null>(null)

  const accountsQ = useQuery({ queryKey: ['accounts'], queryFn: () => listAccounts(token as string), enabled: !!token })
  const accounts = accountsQ.data?.items ?? []
  const tasksQ = useQuery({ queryKey: ['tasks'], queryFn: () => listTasks(token as string), enabled: !!token })
  const tasks = tasksQ.data?.items ?? []
  const friendQueries = useQueries({
    queries: accounts.map((account) => ({
      queryKey: ['friends', account.id],
      queryFn: () => listFriends(token as string, account.id, { limit: 100 }),
      enabled: !!token,
    })),
  })
  const friends = useMemo(() => {
    const index = new Map<string, Friend>()
    friendQueries.forEach((query) => query.data?.items.forEach((friend) => index.set(friend.id, friend)))
    return index
  }, [friendQueries])
  const friendsByAccount = useMemo(() => {
    const result = new Map<string, Friend[]>()
    accounts.forEach((account, index) => result.set(account.id, friendQueries[index]?.data?.items ?? []))
    return result
  }, [accounts, friendQueries])

  const visibleTasks = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('zh-CN')
    return tasks.filter((task) => {
      if (accountFilter !== 'all' && task.account_id !== accountFilter) return false
      if (statusFilter === 'enabled' && !task.enabled) return false
      if (statusFilter === 'disabled' && task.enabled) return false
      if (!query) return true
      const account = accounts.find((item) => item.id === task.account_id)
      const friend = friends.get(task.friend_id)
      return [account?.nickname, friend?.nickname, friend?.display_name, task.message.body ?? '']
        .some((value) => (value ?? '').toLocaleLowerCase('zh-CN').includes(query))
    })
  }, [accountFilter, accounts, friends, search, statusFilter, tasks])

  const enabledCount = tasks.filter((task) => task.enabled).length
  const readyFriends = (accountId: string) => (friendsByAccount.get(accountId) ?? []).filter((friend) => friend.platform_identity_status === 'resolved')

  function openCreate() {
    const account = accounts.find((item) => item.binding_status === 'bound') ?? accounts[0]
    const friend = account ? readyFriends(account.id)[0] : undefined
    if (!account || !friend) {
      toast.error('请先同步一个已确认身份的好友')
      return
    }
    setEditor({ mode: 'create', draft: { accountId: account.id, friendId: friend.id, enabled: true, timezone: 'Asia/Shanghai', windowStart: '19:30', windowEnd: '22:30', messageKind: 'text', message: '', allowFirstMessage: false } })
  }

  function openEdit(task: Task) {
    setEditor({ mode: 'edit', draft: { id: task.id, accountId: task.account_id, friendId: task.friend_id, enabled: task.enabled, timezone: task.timezone, windowStart: task.window_start.slice(0, 5), windowEnd: task.window_end.slice(0, 5), messageKind: task.message.kind, message: task.message.body ?? '', allowFirstMessage: task.allow_first_message ?? false } })
  }

  function changeEditorAccount(accountId: string) {
    const friend = readyFriends(accountId)[0] ?? friendsByAccount.get(accountId)?.[0]
    setEditor((current) => current ? { ...current, draft: { ...current.draft, accountId, friendId: friend?.id ?? '' } } : current)
  }

  async function saveTask() {
    if (!token || !editor) return
    const { draft } = editor
    if (!draft.windowStart || !draft.windowEnd) { toast.error('请选择完整的发送时间窗口'); return }
    if (!draft.message.trim()) { toast.error(draft.messageKind === 'sticker' ? '请填写贴纸 ID' : '请填写消息内容'); return }
    if (draft.windowStart >= draft.windowEnd) { toast.error('结束时间必须晚于开始时间'); return }
    setBusyTaskId(draft.id ?? 'new')
    const body = { enabled: draft.enabled, timezone: draft.timezone, window_start: `${draft.windowStart}:00`, window_end: `${draft.windowEnd}:00`, message: { kind: draft.messageKind, body: draft.message.trim() }, allow_first_message: draft.allowFirstMessage }
    try {
      if (editor.mode === 'create') await createTask(token, { ...body, account_id: draft.accountId, friend_id: draft.friendId })
      else await updateTask(token, draft.id!, body)
      await queryClient.invalidateQueries({ queryKey: ['tasks'] })
      setEditor(null)
      toast.success(editor.mode === 'create' ? '任务已创建' : '任务已保存')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存任务失败')
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
      toast.error(error instanceof Error ? error.message : '更新任务失败')
    } finally { setBusyTaskId(null) }
  }

  async function runTask(task: Task) {
    if (!token) return
    setBusyTaskId(task.id)
    try {
      await runTaskNow(token, task.id)
      toast.success('任务已加入发送队列')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '立即执行失败')
    } finally { setBusyTaskId(null) }
  }

  async function removeTask(task: Task) {
    if (!token || !window.confirm('确定删除这个火花任务吗？删除后需要重新创建配置。')) return
    setBusyTaskId(task.id)
    try {
      await deleteTask(token, task.id)
      await queryClient.invalidateQueries({ queryKey: ['tasks'] })
      toast.success('任务已删除')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '删除任务失败')
    } finally { setBusyTaskId(null) }
  }

  if (accountsQ.isLoading || tasksQ.isLoading) return <div className="space-y-6"><Skeleton className="h-20 w-full" /><Skeleton className="h-72 w-full" /></div>
  if (!accounts.length) return <Card><CardHeader><CardTitle>任务</CardTitle><CardDescription>先绑定抖音账号，再配置火花任务。</CardDescription></CardHeader><CardContent><Button asChild><Link to="/accounts">前往绑定账号</Link></Button></CardContent></Card>

  const editorFriends = editor ? friendsByAccount.get(editor.draft.accountId) ?? [] : []
  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div><p className="text-sm font-medium text-primary">M3 · 自动维护</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">任务</h1><p className="mt-1 text-sm text-muted-foreground">为已确认好友设置每日火花维护时间窗口和消息。</p></div>
        <Button onClick={openCreate}><Plus />新建任务</Button>
      </div>
      <Card><CardContent className="grid gap-4 p-5 sm:grid-cols-3"><div><div className="text-xs text-muted-foreground">任务总数</div><div className="mt-1 text-xl font-semibold">{tasks.length}</div></div><div><div className="text-xs text-muted-foreground">每日启用</div><div className="mt-1 text-xl font-semibold text-primary">{enabledCount}</div></div><div><div className="text-xs text-muted-foreground">当前筛选</div><div className="mt-1 text-xl font-semibold">{visibleTasks.length}</div></div></CardContent></Card>
      <Card>
        <CardHeader><div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end"><div><CardTitle>火花任务</CardTitle><CardDescription>{visibleTasks.length === tasks.length ? `共 ${tasks.length} 个任务` : `筛选出 ${visibleTasks.length} / ${tasks.length} 个任务`}</CardDescription></div><div className="flex items-center gap-2 text-xs text-muted-foreground"><Filter className="size-4" />保存后配置生效</div></div></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[minmax(200px,1fr)_repeat(2,minmax(150px,220px))]"><div className="space-y-1.5"><Label htmlFor="task-search">搜索任务</Label><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input id="task-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="账号、好友或消息内容" className="pl-9" /></div></div><FilterSelect label="账号" value={accountFilter} onChange={setAccountFilter} options={[{ value: 'all', label: '全部账号' }, ...accounts.map((account) => ({ value: account.id, label: account.nickname || '未命名账号' }))]} /><FilterSelect label="状态" value={statusFilter} onChange={(value) => setStatusFilter(value as 'all' | 'enabled' | 'disabled')} options={[{ value: 'all', label: '全部状态' }, { value: 'enabled', label: '每日启用' }, { value: 'disabled', label: '已停用' }]} /></div>
          {tasksQ.isError ? <p className="py-10 text-center text-sm text-destructive">任务列表暂时不可用，请稍后重试。</p> : visibleTasks.length ? <TaskTable tasks={visibleTasks} accounts={accounts} friends={friends} busyTaskId={busyTaskId} onToggle={(task, enabled) => void toggleTask(task, enabled)} onEdit={openEdit} onRun={(task) => void runTask(task)} onDelete={(task) => void removeTask(task)} /> : <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-12 text-center"><p className="font-medium">{tasks.length ? '没有符合条件的任务' : '还没有火花任务'}</p><p className="mt-1 text-sm text-muted-foreground">{tasks.length ? '尝试清除筛选条件。' : '为已确认好友创建第一个每日维护任务。'}</p>{!tasks.length && <Button className="mt-4" variant="outline" onClick={openCreate}>创建任务</Button>}</div>}
        </CardContent>
      </Card>
      {editor && <TaskEditorDrawer draft={editor.draft} accounts={accounts} friends={editorFriends} saving={busyTaskId === (editor.draft.id ?? 'new')} onChange={(patch) => setEditor((current) => current ? { ...current, draft: { ...current.draft, ...patch } } : current)} onAccountChange={changeEditorAccount} onClose={() => setEditor(null)} onSave={() => void saveTask()} />}
    </div>
  )
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[] }) {
  const id = `task-filter-${label}`
  return <div className="space-y-1.5"><Label htmlFor={id}>{label}</Label><select id={id} value={value} onChange={(event) => onChange(event.target.value)} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring">{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
}
