import type { components } from '@douyin-keeper/sdk-ts'
import { Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@douyin-keeper/ui-web'

type AdminAccount = components['schemas']['AdminAccount']
type Capability = components['schemas']['AdminAccountCapability']

export function AdminAccountTable({ accounts }: { accounts: AdminAccount[] }) {
  return <div className="overflow-x-auto rounded-lg border bg-card"><Table><TableHeader><TableRow><TableHead className="pl-5">账号 / 所属用户</TableHead><TableHead>绑定 / Session</TableHead><TableHead>Risk / 暂停</TableHead><TableHead>Capability</TableHead><TableHead>今日发送</TableHead><TableHead className="pr-5">最近错误</TableHead></TableRow></TableHeader><TableBody>{accounts.map((account) => <AccountRow key={account.id} account={account} />)}</TableBody></Table></div>
}

function AccountRow({ account }: { account: AdminAccount }) {
  return <TableRow><TableCell className="min-w-52 pl-5"><div className="font-medium">{account.nickname || '未命名账号'}</div><div className="mt-1 text-xs text-muted-foreground">{account.owner_display_name} · {account.id.slice(0, 8)}</div>{account.platform_user_id && <div className="mt-1 text-xs text-muted-foreground">抖音号 {account.platform_user_id}</div>}</TableCell><TableCell className="min-w-40"><div className="flex flex-wrap gap-2"><Badge variant={account.binding_status === 'bound' ? 'success' : 'muted'}>{bindingLabel(account.binding_status)}</Badge><Badge variant={account.session_status === 'valid' ? 'success' : account.session_status === 'expired' ? 'destructive' : 'warning'}>{sessionLabel(account.session_status)}</Badge></div><div className="mt-2 text-xs text-muted-foreground">检查：{formatDate(account.last_session_check_at)}</div></TableCell><TableCell className="min-w-36"><Badge variant={account.risk_status === 'normal' ? 'success' : account.risk_status === 'paused' ? 'destructive' : 'warning'}>{riskLabel(account.risk_status)}</Badge><div className="mt-2 text-xs text-muted-foreground">{account.paused_at ? `暂停于 ${formatDate(account.paused_at)}` : account.cooldown_until ? `冷却至 ${formatDate(account.cooldown_until)}` : '可运行'}</div></TableCell><TableCell className="min-w-52"><div className="flex max-w-64 flex-wrap gap-1.5">{account.capabilities.length ? account.capabilities.slice(0, 4).map((capability) => <CapabilityBadge key={capability.name} capability={capability} />) : <span className="text-xs text-muted-foreground">暂无快照</span>}{account.capabilities.length > 4 && <span className="text-xs text-muted-foreground">+{account.capabilities.length - 4}</span>}</div></TableCell><TableCell className="min-w-28 text-sm"><div className="font-medium text-emerald-700 dark:text-emerald-400">成功 {account.today_send_succeeded}</div><div className="mt-1 text-xs text-destructive">失败 {account.today_send_failed}</div></TableCell><TableCell className="min-w-44 pr-5">{account.latest_error ? <><Badge variant="warning">{account.latest_error.code}</Badge><div className="mt-2 text-xs text-muted-foreground">{formatDate(account.latest_error.created_at)}</div></> : <span className="text-sm text-muted-foreground">暂无错误</span>}</TableCell></TableRow>
}

function CapabilityBadge({ capability }: { capability: Capability }) {
  return <Badge variant={capability.status === 'available' ? 'success' : capability.status === 'degraded' ? 'warning' : capability.status === 'unavailable' ? 'destructive' : 'muted'}>{capability.name}</Badge>
}

function bindingLabel(value: AdminAccount['binding_status']) {
  return { unbound: '未绑定', binding: '绑定中', bound: '已绑定', released: '已释放' }[value]
}

function sessionLabel(value: AdminAccount['session_status']) {
  return { unknown: '未知', valid: '有效', expired: '已过期', challenge_required: '需验证' }[value]
}

function riskLabel(value: AdminAccount['risk_status']) {
  return { normal: '正常', cooling_down: '冷却中', paused: '已暂停' }[value]
}

function formatDate(value: string | null | undefined) {
  if (!value) return '暂无'
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}
