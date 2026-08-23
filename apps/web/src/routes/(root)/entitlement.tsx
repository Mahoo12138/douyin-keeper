import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from '@douyin-keeper/ui-web'
import { myEntitlement, redeemCardCode } from '@douyin-keeper/sdk-ts'

import { getToken } from '@/auth/session'

export const Route = createFileRoute('/(root)/entitlement')({
  component: EntitlementPage,
})

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

  async function redeem() {
    if (!code.trim()) return
    setBusy(true)
    try {
      const res = await redeemCardCode(token as string, code.trim())
      toast.success(`兑换成功：${res.entitlement.plan_code} 有效期至 ${res.entitlement.expires_at}`)
      setCode('')
      qc.invalidateQueries({ queryKey: ['entitlement'] })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '兑换失败')
    } finally {
      setBusy(false)
    }
  }

  const e = entQ.data
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
    </div>
  )
}