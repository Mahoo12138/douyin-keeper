import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from '@douyin-keeper/ui-web'
import { listMyEntitlementGrants, myEntitlement, redeemCardCode, type components } from '@douyin-keeper/sdk-ts'

import { getToken } from '@/auth/session'

export const Route = createFileRoute('/(root)/entitlement')({
  component: EntitlementPage,
})

type EntitlementGrant = components['schemas']['EntitlementGrant']

function EntitlementPage() {
  const token = getToken()
  const qc = useQueryClient()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  const entQ = useQuery({
    queryKey: ['entitlement'],
    queryFn: () => myEntitlement(token as string),
    enabled: !!token,
  })
  const grantsQ = useInfiniteQuery({
    queryKey: ['entitlement-grants'],
    queryFn: ({ pageParam }) => listMyEntitlementGrants(token as string, { limit: 50, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    enabled: !!token,
  })

  async function redeem() {
    if (!code.trim()) return
    setBusy(true)
    try {
      const res = await redeemCardCode(token as string, code.trim())
      toast.success(`兑换成功：${res.entitlement.plan_code} 有效期至 ${res.entitlement.expires_at}`)
      setCode('')
      qc.invalidateQueries({ queryKey: ['entitlement'] })
      qc.invalidateQueries({ queryKey: ['entitlement-grants'] })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '兑换失败')
    } finally {
      setBusy(false)
    }
  }

  const e = entQ.data
  const grants = grantsQ.data?.pages.flatMap((page) => page.items) ?? []
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">权益与卡密</h1>
        <p className="text-muted-foreground">兑换卡密解锁账号配额与功能</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            当前权益
            {e?.active && <Badge variant="success">有效</Badge>}
            {e && !e.active && <Badge variant="muted">未激活</Badge>}
          </CardTitle>
          <CardDescription>{e?.plan_code ?? '暂无可用权益'}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div>
            <div className="text-sm text-muted-foreground">账号配额</div>
            <div className="text-lg font-semibold">{e ? `${e.usage?.accounts_used ?? 0}/${e.account_quota}` : '—'}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">任务配额</div>
            <div className="text-lg font-semibold">{e ? `${e.usage?.tasks_used ?? 0}/${e.task_quota}` : '—'}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">每日发送</div>
            <div className="text-lg font-semibold">{e ? `${e.usage?.daily_send_reserved ?? 0}/${e.daily_send_quota}` : '—'}</div>
          </div>
          {e?.expires_at && (
            <div className="sm:col-span-3 text-sm text-muted-foreground">
              有效期至 {new Date(e.expires_at).toLocaleString('zh-CN')}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>兑换卡密</CardTitle>
          <CardDescription>输入 DK1 开头的卡密（如 DK1-XXXXX-…）</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="DK1-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX"
              value={code}
              onChange={(ev) => setCode(ev.target.value)}
              className="font-mono"
            />
            <Button onClick={redeem} disabled={busy || !code.trim()}>
              {busy ? '兑换中…' : '兑换'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>授权历史</CardTitle>
          <CardDescription>仅展示当前账号自己的授权时间段，不显示完整卡密。</CardDescription>
        </CardHeader>
        <CardContent>
          {grantsQ.isPending ? (
            <p className="text-sm text-muted-foreground">正在加载授权记录…</p>
          ) : grantsQ.isError ? (
            <p className="text-sm text-destructive">授权记录暂时不可用，请稍后重试。</p>
          ) : grants.length ? (
            <>
              <div className="space-y-3">{grants.map((grant) => <GrantHistoryRow key={grant.id} grant={grant} />)}</div>
              {grantsQ.hasNextPage && (
                <div className="mt-4 flex justify-center">
                  <Button variant="outline" onClick={() => void grantsQ.fetchNextPage()} disabled={grantsQ.isFetchingNextPage}>
                    {grantsQ.isFetchingNextPage ? '加载中…' : '加载更多授权记录'}
                  </Button>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">暂无授权记录。</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function GrantHistoryRow({ grant }: { grant: EntitlementGrant }) {
  const status = grantStatus(grant)
  return <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><span className="font-medium">{grant.plan_code || '未命名方案'}</span><Badge variant={status.variant}>{status.label}</Badge><span className="text-xs text-muted-foreground">{grant.source_type === 'card' ? '卡密兑换' : '管理员授权'}</span></div><p className="mt-1 text-sm text-muted-foreground">{formatDate(grant.starts_at)} — {formatDate(grant.expires_at)}</p></div>{grant.revoked_at && <p className="text-xs text-muted-foreground">撤销于 {formatDate(grant.revoked_at)}</p>}</div>
}

function grantStatus(grant: EntitlementGrant): { label: string; variant: 'success' | 'secondary' | 'muted' } {
  if (grant.revoked_at) return { label: '已撤销', variant: 'muted' }
  const now = Date.now()
  if (new Date(grant.starts_at).getTime() > now) return { label: '待生效', variant: 'secondary' }
  if (new Date(grant.expires_at).getTime() <= now) return { label: '已过期', variant: 'muted' }
  return { label: '有效', variant: 'success' }
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('zh-CN')
}
