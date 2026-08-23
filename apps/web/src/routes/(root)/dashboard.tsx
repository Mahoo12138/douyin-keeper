import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle, Skeleton } from '@douyin-keeper/ui-web'
import { me, myEntitlement } from '@douyin-keeper/sdk-ts'

import { getToken } from '@/auth/session'

export const Route = createFileRoute('/(root)/dashboard')({
  component: DashboardPage,
})

function DashboardPage() {
  const token = getToken()
  const meQ = useQuery({
    queryKey: ['me'],
    queryFn: () => me(token as string),
    enabled: !!token,
  })
  const entQ = useQuery({
    queryKey: ['entitlement'],
    queryFn: () => myEntitlement(token as string),
    enabled: !!token,
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">概览</h1>
        <p className="text-muted-foreground">欢迎回来，{meQ.data?.display_name ?? '…'}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="抖音账号" value={entQ.isLoading ? undefined : `${entQ.data?.usage?.accounts_used ?? 0} / ${entQ.data?.account_quota ?? '—'}`} />
        <StatCard label="火花任务" value={entQ.isLoading ? undefined : `${entQ.data?.usage?.tasks_used ?? 0} / ${entQ.data?.task_quota ?? '—'}`} />
        <StatCard label="每日发送" value={entQ.isLoading ? undefined : `${entQ.data?.usage?.daily_send_reserved ?? 0} / ${entQ.data?.daily_send_quota ?? '—'}`} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>下一步</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <ol className="list-decimal space-y-1 pl-5">
            <li>在「抖音账号」页扫码绑定你的抖音账号</li>
            <li>同步好友后，为好友开启火花维护</li>
            <li>在「权益」页兑换卡密解锁配额</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value?: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {value === undefined ? <Skeleton className="h-7 w-16" /> : <div className="text-2xl font-semibold">{value}</div>}
      </CardContent>
    </Card>
  )
}