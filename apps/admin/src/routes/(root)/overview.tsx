import { createFileRoute } from '@tanstack/react-router'
import { Card, CardContent, CardHeader, CardTitle } from '@douyin-keeper/ui-web'

export const Route = createFileRoute('/(root)/overview')({
  component: () => (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">运营概览</h1>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="用户" value="—" />
        <Stat label="运行中 Worker" value="—" />
        <Stat label="风险事件" value="—" />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>说明</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          M5 里程碑接入 Admin API（/api/admin/…）；当前为控制台外壳与占位页面。
        </CardContent>
      </Card>
    </div>
  ),
})

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="text-2xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  )
}