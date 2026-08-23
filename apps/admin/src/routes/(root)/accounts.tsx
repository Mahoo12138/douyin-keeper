import { createFileRoute } from '@tanstack/react-router'
import { AdminPlaceholder } from '@/components/placeholder-page'

export const Route = createFileRoute('/(root)/accounts')({
  component: () => (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">抖音账号</h1>
      <AdminPlaceholder note="M5 里程碑：全局账号列表、运行状态与风险概览。" />
    </div>
  ),
})