import type { components } from '@douyin-keeper/sdk-ts'
import { Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@douyin-keeper/ui-web'

type Risk = components['schemas']['AdminRisk']

export function AdminRiskTable({ risks }: { risks: Risk[] }) {
  return <div className="overflow-x-auto rounded-lg border bg-card"><Table><TableHeader><TableRow><TableHead className="pl-5">风险 / 账号</TableHead><TableHead>分类 / 严重度</TableHead><TableHead>来源 / 动作</TableHead><TableHead>冷却</TableHead><TableHead className="pr-5">发生时间</TableHead></TableRow></TableHeader><TableBody>{risks.map((risk) => <RiskRow key={risk.id} risk={risk} />)}</TableBody></Table></div>
}

function RiskRow({ risk }: { risk: Risk }) {
  return <TableRow><TableCell className="min-w-56 pl-5"><div className="font-medium">{risk.code}</div><div className="mt-1 text-xs text-muted-foreground">{risk.nickname || '未命名账号'} · {risk.owner_display_name || '未知用户'}</div><div className="mt-1 text-[11px] text-muted-foreground">账号 {risk.account_id.slice(0, 8)}</div></TableCell><TableCell className="min-w-32"><div className="text-sm">{categoryLabel(risk.category)}</div><Badge className="mt-2" variant={severityVariant(risk.severity)}>{severityLabel(risk.severity)}</Badge></TableCell><TableCell className="min-w-44"><div className="text-sm">{risk.source_adapter ?? '系统'}</div><div className="mt-1 text-xs text-muted-foreground">{risk.action ?? '已记录'}</div></TableCell><TableCell className="min-w-32 text-sm">{risk.cooldown_until ? <><div className="text-amber-700 dark:text-amber-400">冷却至</div><div className="mt-1 text-xs text-muted-foreground">{formatDate(risk.cooldown_until)}</div></> : <span className="text-muted-foreground">无冷却</span>}</TableCell><TableCell className="min-w-40 pr-5 text-sm text-muted-foreground">{formatDate(risk.created_at)}</TableCell></TableRow>
}

function categoryLabel(category: Risk['category']) {
  return { AUTH: '身份认证', PLATFORM: '平台', PROTOCOL: '协议', BROWSER: '浏览器', NETWORK: '网络', DATA: '数据' }[category]
}

function severityLabel(severity: Risk['severity']) {
  return { info: '提示', warning: '警告', critical: '严重' }[severity]
}

function severityVariant(severity: Risk['severity']) {
  return { info: 'muted', warning: 'warning', critical: 'destructive' }[severity] as 'muted' | 'warning' | 'destructive'
}

function formatDate(value: string | null | undefined) {
  if (!value) return '暂无'
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}
