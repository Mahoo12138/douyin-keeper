import { useEffect } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowRight, Bell, CheckCircle2, Clock3, ListChecks, Plus, Send, ShieldAlert, Smartphone, UserRound } from 'lucide-react'
import type { ReactNode } from 'react'
import {
	Avatar, AvatarFallback, AvatarImage, Badge, Button, Card, CardContent, CardDescription,
	CardHeader, CardTitle, Skeleton,
} from '@douyin-keeper/ui-web'
import { listNotifications, listSendIntents, listTasks, me, myEntitlement } from '@douyin-keeper/sdk-ts'

import { getToken } from '@/auth/session'
import { bindingLabel, formatDate, riskLabel, sessionLabel, StatusBadge } from '@/features/accounts/account-status'
import { countIntentsByAccount, countTasksByAccount, summarizeAccounts, summarizeIntents, todayRange, type Account } from '@/features/dashboard/dashboard-utils'
import { useAccountsQuery } from '@/features/accounts/use-accounts-query'
import { flattenPageItems } from '@/lib/query-utils'

export const Route = createFileRoute('/(root)/dashboard')({ component: DashboardPage })

function DashboardPage() {
	const token = getToken()
	const range = todayRange()
	const meQ = useQuery({ queryKey: ['me', token], queryFn: () => me(token as string), enabled: !!token, staleTime: 60_000 })
	const entQ = useQuery({ queryKey: ['entitlement'], queryFn: () => myEntitlement(token as string), enabled: !!token })
	const accountsQ = useAccountsQuery(token, { loadAll: true })
	const tasksQ = useInfiniteQuery({ queryKey: ['tasks'], queryFn: ({ pageParam }) => listTasks(token as string, { limit: 50, cursor: pageParam }), initialPageParam: undefined as string | undefined, getNextPageParam: (lastPage) => lastPage?.next_cursor ?? undefined, enabled: !!token })
	const intentsQ = useInfiniteQuery({
		queryKey: ['send-intents', 'dashboard', range.day],
		queryFn: ({ pageParam }) => listSendIntents(token as string, { from: range.from, to: range.to, limit: 100, cursor: pageParam }),
		initialPageParam: undefined as string | undefined,
		getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
		enabled: !!token,
	})
	const notificationsQ = useQuery({ queryKey: ['notifications'], queryFn: () => listNotifications(token as string, { limit: 5 }), enabled: !!token })
	useEffect(() => {
		if (!tasksQ.hasNextPage || tasksQ.isFetchingNextPage) return
		void tasksQ.fetchNextPage()
	}, [tasksQ.fetchNextPage, tasksQ.hasNextPage, tasksQ.isFetchingNextPage])
	useEffect(() => {
		if (!intentsQ.hasNextPage || intentsQ.isFetchingNextPage) return
		void intentsQ.fetchNextPage()
	}, [intentsQ.fetchNextPage, intentsQ.hasNextPage, intentsQ.isFetchingNextPage])

	const accounts = accountsQ.accounts
	const tasks = flattenPageItems(tasksQ.data?.pages ?? [])
	const intents = flattenPageItems(intentsQ.data?.pages ?? [])
	const notifications = notificationsQ.data?.items ?? []
	const accountStats = summarizeAccounts(accounts)
	const intentStats = summarizeIntents(intents)
	const tasksByAccount = countTasksByAccount(tasks)
	const intentsByAccount = countIntentsByAccount(intents)
	const enabledTasks = tasks.filter((task) => task.enabled).length
	const hasDataError = [entQ, accountsQ, tasksQ, intentsQ, notificationsQ].some((query) => query.isError)
	const tasksLoading = tasksQ.isPending || tasksQ.isFetchingNextPage
	const intentsLoading = intentsQ.isPending || intentsQ.isFetchingNextPage

	return (
		<div className="space-y-6">
			<div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
				<div>
					<p className="text-sm font-medium text-primary">今日运行总览</p>
					<h1 className="mt-1 text-3xl font-semibold tracking-tight">概览</h1>
					<p className="mt-2 text-sm text-muted-foreground">欢迎回来，{meQ.data?.display_name ?? '…'}。这里能快速看到今天是否正常。</p>
				</div>
				<div className="flex flex-wrap gap-2">
					<Button asChild variant="outline"><Link to="/accounts"><Plus />绑定账号</Link></Button>
					<Button asChild><Link to="/tasks"><Send />立即执行</Link></Button>
				</div>
			</div>
			{hasDataError && <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-300/70 bg-amber-500/5 px-4 py-3 text-sm dark:border-amber-700/70"><div className="flex items-center gap-2 text-amber-800 dark:text-amber-300"><ShieldAlert className="size-4 shrink-0" />部分概览数据暂时不可用，不影响已存在的任务。</div><Button variant="outline" size="sm" onClick={() => { void Promise.all([entQ.refetch(), accountsQ.refetch(), tasksQ.refetch(), intentsQ.refetch(), notificationsQ.refetch()]) }}>重试</Button></div>}

			<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
				<StatCard icon={<Smartphone />} label="有效账号" value={accountsQ.isLoading ? undefined : accountsQ.isError ? '—' : `${accountStats.valid} / ${accountStats.bound}`} detail={accountsQ.isError ? '数据暂时不可用' : '有效 / 已绑定'} />
				<StatCard icon={<Send />} label="今日发送" value={intentsLoading ? undefined : intentsQ.isError ? '—' : String(intentStats.succeeded)} detail={intentsQ.isError ? '数据暂时不可用' : `待处理 ${intentStats.pending} · 失败 ${intentStats.failed}`} />
				<StatCard icon={<ListChecks />} label="启用任务" value={tasksLoading ? undefined : tasksQ.isError ? '—' : `${enabledTasks} / ${tasks.length}`} detail={tasksQ.isError ? '数据暂时不可用' : '启用 / 全部'} />
				<StatCard icon={<Bell />} label="未读通知" value={notificationsQ.isLoading ? undefined : notificationsQ.isError ? '—' : String(notificationsQ.data?.unread_count ?? 0)} detail={notificationsQ.isError ? '数据暂时不可用' : '需要关注的风险与提醒'} />
			</div>

			<div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
				<Card>
					<CardHeader><CardTitle>账号状态</CardTitle><CardDescription>登录态和风险状态会直接影响今日任务。</CardDescription></CardHeader>
					<CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
						<StatusMetric label="已绑定" value={accountStats.bound} />
						<StatusMetric label="会话有效" value={accountStats.valid} tone="success" />
						<StatusMetric label="会话过期" value={accountStats.expired} tone="warning" />
						<StatusMetric label="已暂停" value={accountStats.paused} tone="danger" />
					</CardContent>
				</Card>
				<Card>
					<CardHeader><CardTitle>下一次计划</CardTitle><CardDescription>按今天的任务执行时间排序。</CardDescription></CardHeader>
					<CardContent>{intentsQ.isError ? <ErrorLine text="计划数据暂时不可用" onRetry={() => void intentsQ.refetch()} /> : intentStats.next ? <div className="flex items-start gap-3"><Clock3 className="mt-0.5 size-5 text-primary" /><div><p className="font-medium">{intentStats.next.friend.display_name}</p><p className="mt-1 text-sm text-muted-foreground">{intentStats.next.account.nickname || '未命名账号'} · {formatDate(intentStats.next.scheduled_at)}</p><Badge className="mt-3" variant="muted">{intentStats.next.status === 'running' ? '执行中' : '等待执行'}</Badge></div></div> : <EmptyLine icon={<Clock3 />} text="今天暂无待执行任务" action="查看任务" to="/tasks" />}</CardContent>
				</Card>
			</div>

			<div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
				<Card>
					<CardHeader className="flex flex-row items-start justify-between space-y-0"><div><CardTitle>账号概览</CardTitle><CardDescription>每个账号的任务和今日发送状态。</CardDescription></div><Button asChild variant="ghost" size="sm"><Link to="/accounts">全部账号<ArrowRight /></Link></Button></CardHeader>
					<CardContent>{accountsQ.isLoading ? <div className="space-y-3"><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /></div> : accountsQ.isError ? <ErrorLine text="账号数据暂时不可用" onRetry={() => void accountsQ.refetch()} /> : accounts.length ? <div className="space-y-3">{accounts.slice(0, 6).map((account) => { const sends = intentsByAccount.get(account.id) ?? { pending: 0, succeeded: 0, failed: 0 }; return <AccountSummary key={account.id} account={account} taskCount={tasksByAccount.get(account.id) ?? 0} sends={sends} /> })}</div> : <EmptyLine icon={<Smartphone />} text="还没有绑定抖音账号" action="去绑定" to="/accounts" />}</CardContent>
				</Card>
				<Card>
					<CardHeader className="flex flex-row items-start justify-between space-y-0"><div><CardTitle>最近风险提示</CardTitle><CardDescription>优先处理登录失效和安全验证。</CardDescription></div><Button asChild variant="ghost" size="sm"><Link to="/notifications">查看全部<ArrowRight /></Link></Button></CardHeader>
					<CardContent>{notificationsQ.isLoading ? <Skeleton className="h-24 w-full" /> : notificationsQ.isError ? <ErrorLine text="通知数据暂时不可用" onRetry={() => void notificationsQ.refetch()} /> : notifications.length ? <div className="space-y-3">{notifications.slice(0, 3).map((item) => <div key={item.id} className="flex items-start gap-3 rounded-lg bg-muted/40 p-3"><ShieldAlert className={`mt-0.5 size-4 shrink-0 ${item.priority === 'critical' ? 'text-destructive' : 'text-amber-600 dark:text-amber-400'}`} /><div className="min-w-0"><p className="truncate text-sm font-medium">{item.title}</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{item.body}</p></div></div>)}</div> : <EmptyLine icon={<CheckCircle2 />} text="暂无风险通知" action="打开通知" to="/notifications" />}</CardContent>
				</Card>
			</div>

			<Card>
				<CardHeader><CardTitle>快速开始</CardTitle><CardDescription>还没有完成配置？从这里继续。</CardDescription></CardHeader>
				<CardContent className="grid gap-3 sm:grid-cols-3"><QuickAction icon={<Smartphone />} title="绑定抖音账号" description="扫码或短信绑定" to="/accounts" /><QuickAction icon={<UserRound />} title="同步好友" description="获取最新好友列表" to="/friends" /><QuickAction icon={<ListChecks />} title="配置火花任务" description={entQ.data?.active ? '设置每日执行窗口' : '先兑换权益再配置'} to={entQ.data?.active ? '/tasks' : '/entitlement'} /></CardContent>
			</Card>
		</div>
	)
}

function StatCard({ icon, label, value, detail }: { icon: ReactNode; label: string; value?: string; detail: string }) {
	return <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle><span className="text-muted-foreground">{icon}</span></CardHeader><CardContent><div className="text-2xl font-semibold">{value ?? <Skeleton className="h-8 w-20" />}</div><p className="mt-1 text-xs text-muted-foreground">{detail}</p></CardContent></Card>
}

function StatusMetric({ label, value, tone = 'default' }: { label: string; value: number; tone?: 'default' | 'success' | 'warning' | 'danger' }) {
	const color = tone === 'success' ? 'text-emerald-600 dark:text-emerald-400' : tone === 'warning' ? 'text-amber-600 dark:text-amber-400' : tone === 'danger' ? 'text-destructive' : 'text-foreground'
	return <div className="rounded-lg bg-muted/40 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className={`mt-1 text-2xl font-semibold ${color}`}>{value}</p></div>
}

function AccountSummary({ account, taskCount, sends }: { account: Account; taskCount: number; sends: { pending: number; succeeded: number; failed: number; next?: { friend: { display_name: string }; scheduled_at: string } } }) {
	return <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex min-w-0 items-start gap-3"><Avatar><AvatarImage src={account.avatar_url ?? undefined} alt={`${account.nickname || '抖音账号'}头像`} /><AvatarFallback>{(account.nickname || '抖').slice(0, 1)}</AvatarFallback></Avatar><div className="min-w-0"><p className="truncate font-medium">{account.nickname || '未命名账号'}</p><div className="mt-1 flex flex-wrap gap-1.5"><StatusBadge label={bindingLabel(account.binding_status)} variant={account.binding_status === 'bound' ? 'success' : 'muted'} /><StatusBadge label={sessionLabel(account.session_status)} variant={account.session_status === 'valid' ? 'success' : account.session_status === 'expired' ? 'destructive' : 'warning'} /><StatusBadge label={riskLabel(account.risk_status)} variant={account.risk_status === 'normal' ? 'success' : account.risk_status === 'paused' ? 'destructive' : 'warning'} /></div><p className="mt-2 text-xs text-muted-foreground">最近同步：{formatDate(account.last_friend_sync_at)}</p><p className="mt-1 truncate text-xs text-muted-foreground">下一次：{sends.next ? `${sends.next.friend.display_name} · ${formatDate(sends.next.scheduled_at)}` : '暂无计划'}</p></div></div><div className="grid grid-cols-2 gap-4 text-sm sm:min-w-64 sm:grid-cols-4"><Metric label="启用任务" value={taskCount} /><Metric label="今日发送" value={sends.succeeded} /><Metric label="待处理" value={sends.pending} /><Metric label="失败" value={sends.failed} /></div><Button asChild variant="ghost" size="sm" className="self-start sm:self-auto"><Link to="/accounts">进入账号<ArrowRight /></Link></Button></div>
}

function Metric({ label, value }: { label: string; value: number }) { return <div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-medium">{value}</p></div> }

function EmptyLine({ icon, text, action, to }: { icon: ReactNode; text: string; action: string; to: '/accounts' | '/friends' | '/notifications' | '/tasks' }) { return <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed p-4"><div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">{icon}<span>{text}</span></div><Button asChild variant="outline" size="sm"><Link to={to}>{action}</Link></Button></div> }

function ErrorLine({ text, onRetry }: { text: string; onRetry: () => void }) { return <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-300/70 bg-amber-500/5 p-4 text-sm dark:border-amber-700/70"><span className="text-muted-foreground">{text}</span><Button variant="outline" size="sm" onClick={onRetry}>重试</Button></div> }

function QuickAction({ icon, title, description, to }: { icon: ReactNode; title: string; description: string; to: '/accounts' | '/friends' | '/tasks' | '/entitlement' }) { return <Link to={to} className="group flex items-center gap-3 rounded-lg border p-4 transition-colors hover:bg-accent"><span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">{icon}</span><span className="min-w-0"><span className="block font-medium group-hover:text-primary">{title}</span><span className="mt-1 block truncate text-xs text-muted-foreground">{description}</span></span><ArrowRight className="ml-auto size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" /></Link> }
