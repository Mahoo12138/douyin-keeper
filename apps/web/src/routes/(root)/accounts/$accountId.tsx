import { useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { toast } from 'sonner'
import { ArrowLeft, CheckCircle2, Clock3, History, ListChecks, RefreshCw, Send, ShieldCheck, Smartphone, UsersRound } from 'lucide-react'
import { accountCapabilities, checkAccountSession, getJob, listAccounts, listFriends, listSendIntents, listTasks, syncAccountFriends, updateFriend, type components } from '@douyin-keeper/sdk-ts'
import { Avatar, AvatarFallback, AvatarImage, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Skeleton } from '@douyin-keeper/ui-web'

import { getToken } from '@/auth/session'
import { CapabilityPanel } from '@/features/accounts/capability-panel'
import { bindingLabel, formatDate, riskLabel, sessionLabel, StatusBadge } from '@/features/accounts/account-status'
import { type Account, type Capability } from '@/features/accounts/account-types'
import { friendsById, summarizeAccountIntents, tasksForAccount } from '@/features/accounts/account-detail-utils'
import { FriendTable } from '@/features/friends/friend-table'
import type { Friend, SparkTask } from '@/features/friends/friend-types'
import { HistoryDetailDrawer } from '@/features/history/history-detail-drawer'

type Tab = 'overview' | 'friends' | 'tasks' | 'history' | 'capabilities'
type Intent = components['schemas']['SendIntent']

export const Route = createFileRoute('/(root)/accounts/$accountId')({ component: AccountDetailPage })

function AccountDetailPage() {
	const token = getToken()
	const { accountId } = Route.useParams()
	const queryClient = useQueryClient()
	const [tab, setTab] = useState<Tab>('overview')
	const [busyAction, setBusyAction] = useState<'session' | 'friends' | null>(null)
	const [pendingFriendId, setPendingFriendId] = useState<string | null>(null)
	const [selectedIntent, setSelectedIntent] = useState<Intent | null>(null)
	const accountsQ = useQuery({ queryKey: ['accounts'], queryFn: () => listAccounts(token as string), enabled: !!token })
	const friendsQ = useQuery({ queryKey: ['account-friends', accountId], queryFn: () => listFriends(token as string, accountId, { limit: 100 }), enabled: !!token })
	const tasksQ = useQuery({ queryKey: ['tasks'], queryFn: () => listTasks(token as string), enabled: !!token })
	const intentsQ = useQuery({ queryKey: ['send-intents', 'account', accountId], queryFn: () => listSendIntents(token as string, { account_id: accountId }), enabled: !!token })
	const capabilitiesQ = useQuery({ queryKey: ['account-capabilities', accountId], queryFn: () => accountCapabilities(token as string, accountId), enabled: !!token })

	const account = accountsQ.data?.items.find((item) => item.id === accountId)
	const friends = friendsQ.data?.items ?? []
	const tasks = tasksForAccount(tasksQ.data?.items ?? [], accountId)
	const intents = intentsQ.data?.items ?? []
	const intentStats = summarizeAccountIntents(intents)
	const friendMap = friendsById(friends)

	async function runAccountAction(action: 'session' | 'friends') {
		if (!token) return
		setBusyAction(action)
		try {
			const job = action === 'session' ? await checkAccountSession(token, accountId) : await syncAccountFriends(token, accountId)
			await waitForJob(token, job.job_id)
			toast.success(action === 'session' ? '会话检查已完成' : '好友同步已完成')
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: ['accounts'] }),
				queryClient.invalidateQueries({ queryKey: ['account-friends', accountId] }),
				queryClient.invalidateQueries({ queryKey: ['account-capabilities', accountId] }),
			])
		} catch (error) {
			toast.error(error instanceof Error ? error.message : '账号任务执行失败')
		} finally {
			setBusyAction(null)
		}
	}

	async function toggleFriend(friend: Friend, enabled: boolean) {
		setPendingFriendId(friend.id)
		try {
			await updateFriend(token as string, friend.id, enabled)
			await queryClient.invalidateQueries({ queryKey: ['account-friends', accountId] })
			toast.success(enabled ? '已开启火花维护' : '已关闭火花维护')
		} catch (error) {
			toast.error(error instanceof Error ? error.message : '火花开关更新失败')
		} finally {
			setPendingFriendId(null)
		}
	}

	if (accountsQ.isLoading) return <AccountDetailLoading />
	if (accountsQ.isError) return <DetailError text="账号信息暂时不可用" onRetry={() => void accountsQ.refetch()} />
	if (!account) return <DetailError text="账号不存在或已解除绑定" />

	return (
		<div className="space-y-6">
			<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
				<div className="flex min-w-0 items-start gap-3">
					<Link to="/accounts" className="mt-1 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="返回账号列表"><ArrowLeft className="size-5" /></Link>
					<Avatar className="size-14"><AvatarImage src={account.avatar_url ?? undefined} alt={`${account.nickname || '抖音账号'}头像`} /><AvatarFallback><Smartphone className="size-5" /></AvatarFallback></Avatar>
					<div className="min-w-0"><p className="text-sm font-medium text-primary">账号详情</p><h1 className="mt-1 truncate text-2xl font-semibold tracking-tight">{account.nickname || '未命名账号'}</h1><div className="mt-2 flex flex-wrap gap-1.5"><StatusBadge label={bindingLabel(account.binding_status)} variant={account.binding_status === 'bound' ? 'success' : 'muted'} /><StatusBadge label={sessionLabel(account.session_status)} variant={account.session_status === 'valid' ? 'success' : account.session_status === 'expired' ? 'destructive' : 'warning'} /><StatusBadge label={riskLabel(account.risk_status)} variant={account.risk_status === 'normal' ? 'success' : account.risk_status === 'paused' ? 'destructive' : 'warning'} /></div></div>
				</div>
				<div className="flex flex-wrap gap-2 sm:justify-end"><Button variant="outline" onClick={() => void runAccountAction('session')} disabled={busyAction !== null}><RefreshCw className={busyAction === 'session' ? 'animate-spin' : ''} />检查登录态</Button><Button onClick={() => void runAccountAction('friends')} disabled={busyAction !== null}><UsersRound />同步好友</Button></div>
			</div>

			<div className="flex gap-1 overflow-x-auto border-b" role="tablist" aria-label="账号详情分区">{tabs.map((item) => <button key={item.value} type="button" role="tab" aria-selected={tab === item.value} onClick={() => setTab(item.value)} className={`shrink-0 border-b-2 px-3 py-2.5 text-sm transition-colors ${tab === item.value ? 'border-primary font-medium text-foreground' : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'}`}>{item.label}</button>)}</div>

			{tab === 'overview' && <OverviewTab account={account} intents={intents} stats={intentStats} intentsError={intentsQ.isError} onRetry={() => void intentsQ.refetch()} />}
			{tab === 'friends' && <FriendsTab friends={friends} tasks={tasks} accountId={accountId} loading={friendsQ.isLoading || tasksQ.isLoading} error={friendsQ.isError || tasksQ.isError} pendingFriendId={pendingFriendId} onToggle={toggleFriend} onRetry={() => { void friendsQ.refetch(); void tasksQ.refetch() }} />}
			{tab === 'tasks' && <TasksTab tasks={tasks} friends={friendMap} loading={tasksQ.isLoading || friendsQ.isLoading} error={tasksQ.isError || friendsQ.isError} onRetry={() => { void tasksQ.refetch(); void friendsQ.refetch() }} />}
			{tab === 'history' && <HistoryTab intents={intents} loading={intentsQ.isLoading} error={intentsQ.isError} onRetry={() => void intentsQ.refetch()} onSelect={setSelectedIntent} />}
			{tab === 'capabilities' && <div className="space-y-4"><CapabilityPanel account={account} capabilities={(capabilitiesQ.data?.items ?? []) as Capability[]} loading={capabilitiesQ.isLoading} error={capabilitiesQ.isError} /><Card><CardHeader><CardTitle className="text-base">登录与能力说明</CardTitle><CardDescription>能力快照只描述当前账号是否可用，不展示 Session、Cookie 或平台内部凭据。</CardDescription></CardHeader><CardContent className="grid gap-3 text-sm sm:grid-cols-2"><Fact label="上次会话检查" value={formatDate(account.last_session_check_at)} /><Fact label="上次好友同步" value={formatDate(account.last_friend_sync_at)} /></CardContent></Card></div>}
			{selectedIntent && <HistoryDetailDrawer intent={selectedIntent} token={token as string} onClose={() => setSelectedIntent(null)} />}
		</div>
	)
}

const tabs: Array<{ value: Tab; label: string }> = [
	{ value: 'overview', label: '概览' },
	{ value: 'friends', label: '好友' },
	{ value: 'tasks', label: '任务' },
	{ value: 'history', label: '记录' },
	{ value: 'capabilities', label: '登录与能力' },
]

function OverviewTab({ account, intents, stats, intentsError, onRetry }: { account: Account; intents: Intent[]; stats: ReturnType<typeof summarizeAccountIntents>; intentsError: boolean; onRetry: () => void }) {
	const next = intents.filter((intent) => ['pending', 'queued', 'running', 'retry_wait'].includes(intent.status)).sort((left, right) => new Date(left.scheduled_at).getTime() - new Date(right.scheduled_at).getTime())[0]
	return <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-4"><SummaryCard icon={<Send />} label="今日成功" value={intentsError ? '—' : stats.succeeded} /><SummaryCard icon={<Clock3 />} label="待处理" value={intentsError ? '—' : stats.pending} tone={stats.pending ? 'warning' : undefined} /><SummaryCard icon={<ShieldCheck />} label="失败" value={intentsError ? '—' : stats.failed} tone={stats.failed ? 'danger' : undefined} /><SummaryCard icon={<CheckCircle2 />} label="跳过/取消" value={intentsError ? '—' : stats.skipped} /></div><div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]"><Card><CardHeader><CardTitle>账号状态</CardTitle><CardDescription>登录态、同步和风险状态。</CardDescription></CardHeader><CardContent className="grid gap-3 text-sm sm:grid-cols-2"><Fact label="绑定状态" value={bindingLabel(account.binding_status)} /><Fact label="Session" value={sessionLabel(account.session_status)} /><Fact label="风险状态" value={riskLabel(account.risk_status)} /><Fact label="最近会话检查" value={formatDate(account.last_session_check_at)} /><Fact label="最近好友同步" value={formatDate(account.last_friend_sync_at)} /><Fact label="暂停时间" value={formatDate(account.paused_at)} /></CardContent></Card><Card><CardHeader><CardTitle>下一次任务</CardTitle><CardDescription>当前账号最近的待执行计划。</CardDescription></CardHeader><CardContent>{intentsError ? <DetailError text="发送记录暂时不可用" onRetry={onRetry} /> : next ? <div className="flex items-start gap-3"><Clock3 className="mt-0.5 size-5 text-primary" /><div><p className="font-medium">{next.friend.display_name}</p><p className="mt-1 text-sm text-muted-foreground">{formatDate(next.scheduled_at)} · {next.task?.body || (next.task?.message_kind === 'sticker' ? '贴纸消息' : '任务')}</p><Badge className="mt-3" variant="muted">{next.status === 'running' ? '执行中' : '等待执行'}</Badge></div></div> : <EmptyPanel icon={<Clock3 />} text="当前没有待执行计划" />}</CardContent></Card></div></div>
}

function FriendsTab({ friends, tasks, accountId, loading, error, pendingFriendId, onToggle, onRetry }: { friends: Friend[]; tasks: SparkTask[]; accountId: string; loading: boolean; error: boolean; pendingFriendId: string | null; onToggle: (friend: Friend, enabled: boolean) => void; onRetry: () => void }) {
	return <Card><CardHeader><CardTitle className="flex items-center gap-2"><UsersRound className="size-4" />账号好友</CardTitle><CardDescription>{friends.length ? `共 ${friends.length} 位好友；可直接调整火花维护开关。` : '好友同步后会出现在这里。'}</CardDescription></CardHeader><CardContent>{loading ? <DetailListLoading /> : error ? <DetailError text="好友数据暂时不可用" onRetry={onRetry} /> : friends.length ? <div className="overflow-x-auto"><FriendTable friends={friends} tasks={tasks} accountId={accountId} pendingFriendId={pendingFriendId} onToggle={onToggle} /></div> : <EmptyPanel icon={<UsersRound />} text="还没有同步好友" />}</CardContent></Card>
}

function TasksTab({ tasks, friends, loading, error, onRetry }: { tasks: SparkTask[]; friends: Map<string, Friend>; loading: boolean; error: boolean; onRetry: () => void }) {
	return <Card><CardHeader><CardTitle className="flex items-center gap-2"><ListChecks className="size-4" />账号任务</CardTitle><CardDescription>展示此账号的任务配置；编辑和立即执行可在任务页完成。</CardDescription></CardHeader><CardContent>{loading ? <DetailListLoading /> : error ? <DetailError text="任务数据暂时不可用" onRetry={onRetry} /> : tasks.length ? <div className="space-y-3">{tasks.map((task) => <TaskDetailRow key={task.id} task={task} friend={friends.get(task.friend_id)} />)}</div> : <EmptyPanel icon={<ListChecks />} text="当前账号还没有任务配置" action="前往任务页" to="/tasks" />}</CardContent></Card>
}

function TaskDetailRow({ task, friend }: { task: SparkTask; friend?: Friend }) {
	return <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{friend?.nickname || friend?.display_name || '好友'}</p><Badge variant={task.enabled ? 'success' : 'muted'}>{task.enabled ? '每日启用' : '已停用'}</Badge></div><p className="mt-1 truncate text-sm text-muted-foreground">{task.message.body || (task.message.kind === 'sticker' ? '贴纸消息' : '未填写内容')}</p></div><div className="flex shrink-0 items-center gap-4 text-sm"><div><p className="text-xs text-muted-foreground">时间窗口</p><p className="mt-1">{task.window_start.slice(0, 5)}–{task.window_end.slice(0, 5)}</p></div><div><p className="text-xs text-muted-foreground">时区</p><p className="mt-1">{task.timezone}</p></div><Link to="/tasks" className="text-primary hover:underline">管理</Link></div></div>
}

function HistoryTab({ intents, loading, error, onRetry, onSelect }: { intents: Intent[]; loading: boolean; error: boolean; onRetry: () => void; onSelect: (intent: Intent) => void }) {
	return <Card><CardHeader><CardTitle className="flex items-center gap-2"><History className="size-4" />账号发送记录</CardTitle><CardDescription>{intents.length ? `最近显示 ${intents.length} 条记录；点击记录查看执行时间线。` : '任务执行后，记录会出现在这里。'}</CardDescription></CardHeader><CardContent>{loading ? <DetailListLoading /> : error ? <DetailError text="发送记录暂时不可用" onRetry={onRetry} /> : intents.length ? <div className="space-y-2">{intents.slice(0, 100).map((intent) => <button key={intent.id} type="button" onClick={() => onSelect(intent)} className="flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-accent"><span className="min-w-0"><span className="block truncate font-medium">{intent.friend.display_name}</span><span className="mt-1 block text-xs text-muted-foreground">{formatDate(intent.scheduled_at)} · {intent.task?.body || (intent.task?.message_kind === 'sticker' ? '贴纸消息' : '任务')}</span></span><span className="flex shrink-0 items-center gap-2"><Badge variant={statusVariant(intent.status)}>{statusLabel(intent.status)}</Badge><span className="text-xs text-primary">详情</span></span></button>)}</div> : <EmptyPanel icon={<History />} text="当前账号暂无发送记录" />}</CardContent></Card>
}

function SummaryCard({ icon, label, value, tone }: { icon: ReactNode; label: string; value: number | string; tone?: 'warning' | 'danger' }) {
	return <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle><span className={tone === 'danger' ? 'text-destructive' : tone === 'warning' ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}>{icon}</span></CardHeader><CardContent><p className={`text-2xl font-semibold ${tone === 'danger' ? 'text-destructive' : tone === 'warning' ? 'text-amber-600 dark:text-amber-400' : ''}`}>{value}</p></CardContent></Card>
}

function Fact({ label, value }: { label: string; value: string }) {
	return <div className="rounded-lg bg-muted/40 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 truncate font-medium" title={value}>{value}</p></div>
}

function EmptyPanel({ icon, text, action, to }: { icon: ReactNode; text: string; action?: string; to?: '/tasks' }) {
	return <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center"><span className="text-muted-foreground">{icon}</span><p className="mt-3 text-sm text-muted-foreground">{text}</p>{action && to && <Button asChild className="mt-4" variant="outline" size="sm"><Link to={to}>{action}</Link></Button>}</div>
}

function DetailError({ text, onRetry }: { text: string; onRetry?: () => void }) {
	return <div className="flex flex-col items-center justify-center rounded-lg border border-destructive/30 bg-destructive/5 py-10 text-center"><p className="font-medium">{text}</p>{onRetry && <Button className="mt-4" variant="outline" size="sm" onClick={onRetry}>重新加载</Button>}</div>
}

function DetailListLoading() {
	return <div className="space-y-3"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>
}

function AccountDetailLoading() {
	return <div className="space-y-6"><div className="flex items-center gap-3"><Skeleton className="size-14 rounded-full" /><div className="space-y-2"><Skeleton className="h-5 w-36" /><Skeleton className="h-4 w-52" /></div></div><Skeleton className="h-11 w-full" /><div className="grid gap-3 sm:grid-cols-4"><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div><Skeleton className="h-72 w-full" /></div>
}

function statusLabel(status: Intent['status']) {
	return { pending: '待处理', queued: '排队中', running: '执行中', retry_wait: '等待重试', succeeded: '已成功', failed: '失败', skipped: '已跳过', cancelled: '已取消' }[status]
}

function statusVariant(status: Intent['status']): 'success' | 'warning' | 'destructive' | 'muted' | 'secondary' {
	const variants: Record<Intent['status'], 'success' | 'warning' | 'destructive' | 'muted' | 'secondary'> = { pending: 'secondary', queued: 'warning', running: 'warning', retry_wait: 'warning', succeeded: 'success', failed: 'destructive', skipped: 'muted', cancelled: 'muted' }
	return variants[status]
}

async function waitForJob(token: string, jobId: string) {
	for (let attempt = 0; attempt < 60; attempt += 1) {
		const job = await getJob(token, jobId)
		if (job.status === 'succeeded') return
		if (job.status === 'failed' || job.status === 'cancelled') throw new Error(job.error_code ?? '任务未完成')
		await new Promise((resolve) => window.setTimeout(resolve, 1000))
	}
	throw new Error('任务执行超时，请稍后刷新状态')
}
