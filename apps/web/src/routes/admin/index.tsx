import { createFileRoute } from '@tanstack/react-router'
import { Card, CardContent, CardHeader, CardTitle } from '@douyin-keeper/ui-web'

export const Route = createFileRoute('/admin/')({ component: AdminOverview })

function AdminOverview() {
  return <div className="space-y-8"><div><p className="text-sm font-medium text-primary">运营中心</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">运营概览</h1><p className="mt-2 text-sm text-muted-foreground">统一查看账号、队列和风险状态。</p></div><div className="grid gap-4 sm:grid-cols-3"><Stat label="用户" value="—" /><Stat label="运行中 Worker" value="—" /><Stat label="风险事件" value="—" /></div><Card><CardHeader><CardTitle>管理员工作台</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">M5 将接入 Admin API。当前页面已经与用户端共用同一套登录态、组件库和主题系统。</CardContent></Card></div>
}

function Stat({ label, value }: { label: string; value: string }) {
  return <Card><CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle></CardHeader><CardContent className="pt-0"><div className="text-2xl font-semibold">{value}</div></CardContent></Card>
}
