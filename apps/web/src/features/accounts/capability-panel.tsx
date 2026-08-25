import { Check, CircleAlert } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Skeleton } from '@douyin-keeper/ui-web'

import type { Account, Capability } from './account-types'
import { CapabilityItem } from './account-status'

export function CapabilityPanel({ account, capabilities, loading, error }: { account: Account; capabilities: Capability[]; loading: boolean; error: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Check className="size-4 text-primary" />能力快照</CardTitle>
        <CardDescription>{account.nickname || '账号'} 的最新 adapter 能力状态</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? <Skeleton className="h-20 w-full" /> : error ? (
          <div className="flex items-center gap-2 text-sm text-destructive"><CircleAlert className="size-4" />能力快照暂时不可用</div>
        ) : capabilities.length === 0 ? (
          <p className="text-sm text-muted-foreground">尚未完成能力探测。</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
			{capabilities.map((capability) => <CapabilityItem key={`${capability.capability}:${capability.adapter ?? 'unassigned'}`} capability={capability} />)}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
