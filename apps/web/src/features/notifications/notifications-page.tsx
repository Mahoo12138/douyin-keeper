import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Bell, Check, CircleAlert, Info, ShieldAlert } from 'lucide-react'
import { listNotifications, markAllNotificationsRead, markNotificationRead, type components } from '@douyin-keeper/sdk-ts'
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Skeleton } from '@douyin-keeper/ui-web'

import { getToken } from '@/auth/session'

type Notification = components['schemas']['Notification']

export function NotificationsPage() {
  const token = getToken()
  const queryClient = useQueryClient()
  const notificationsQ = useInfiniteQuery({
    queryKey: ['notifications'],
    queryFn: ({ pageParam }) => listNotifications(token as string, { limit: 50, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    enabled: !!token,
  })
  const markReadMutation = useMutation({
    mutationFn: (id: string) => markNotificationRead(token as string, id),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['notifications'] }); void queryClient.invalidateQueries({ queryKey: ['notification-summary'] }) },
  })
  const markAllMutation = useMutation({
    mutationFn: () => markAllNotificationsRead(token as string),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['notifications'] }); void queryClient.invalidateQueries({ queryKey: ['notification-summary'] }) },
  })
  const items = notificationsQ.data?.pages.flatMap((page) => page.items) ?? []
  const unreadCount = notificationsQ.data?.pages[0]?.unread_count ?? 0

  return <div className="space-y-6"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-medium text-primary">消息中心</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">通知</h1><p className="mt-2 text-sm text-muted-foreground">及时处理登录失效、安全验证和任务风险。</p></div><div className="flex items-center gap-2"><Badge variant={unreadCount ? 'warning' : 'muted'}>{unreadCount ? `${unreadCount} 条未读` : '已全部读'}</Badge><Button variant="outline" onClick={() => markAllMutation.mutate()} disabled={!unreadCount || markAllMutation.isPending}>{markAllMutation.isPending ? '处理中…' : '全部标为已读'}</Button></div></div>{notificationsQ.isPending ? <NotificationLoading /> : notificationsQ.isError ? <Card><CardHeader><CardTitle>通知暂时不可用</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">请稍后重试，当前不会影响任务执行。</p><Button className="mt-4" variant="outline" onClick={() => void notificationsQ.refetch()}>重试</Button></CardContent></Card> : items.length ? <div className="space-y-3">{items.map((item) => <NotificationItem key={item.id} item={item} pending={markReadMutation.isPending && markReadMutation.variables === item.id} onMarkRead={(id) => markReadMutation.mutate(id)} />)}</div> : <Card><CardContent className="py-16 text-center"><Bell className="mx-auto size-8 text-muted-foreground/60" /><p className="mt-4 font-medium">暂无通知</p><p className="mt-1 text-sm text-muted-foreground">账号状态和任务风险发生变化时，会在这里提醒你。</p></CardContent></Card>}{notificationsQ.hasNextPage ? <div className="flex justify-center"><Button variant="outline" onClick={() => void notificationsQ.fetchNextPage()} disabled={notificationsQ.isFetchingNextPage}>{notificationsQ.isFetchingNextPage ? '加载中…' : '加载更多通知'}</Button></div> : null}</div>
}

function NotificationItem({ item, pending, onMarkRead }: { item: Notification; pending: boolean; onMarkRead: (id: string) => void }) {
  const unread = item.read_at === null
  const Icon = item.priority === 'critical' ? ShieldAlert : item.priority === 'warning' ? CircleAlert : Info
  return <Card className={unread ? 'border-primary/30 bg-primary/[0.02]' : ''}><CardContent className="flex items-start gap-4 p-5"><div className={`mt-0.5 rounded-lg p-2 ${item.priority === 'critical' ? 'bg-destructive/10 text-destructive' : item.priority === 'warning' ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400' : 'bg-muted text-muted-foreground'}`}><Icon className="size-4" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="font-medium">{item.title}</h2>{unread && <Badge variant="default" className="px-1.5 py-0 text-[10px]">未读</Badge>}</div><p className="mt-1 text-sm leading-6 text-muted-foreground">{item.body}</p><p className="mt-2 text-xs text-muted-foreground">{formatDate(item.created_at)}</p></div>{unread && <Button variant="ghost" size="sm" className="shrink-0" disabled={pending} onClick={() => onMarkRead(item.id)}><Check />{pending ? '处理中…' : '标为已读'}</Button>}</CardContent></Card>
}

function NotificationLoading() {
  return <div className="space-y-3">{Array.from({ length: 3 }, (_, index) => <Card key={index}><CardContent className="p-5"><Skeleton className="h-20 w-full" /></CardContent></Card>)}</div>
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}
