import { createFileRoute } from '@tanstack/react-router'
import { AdminPlaceholder } from '@/components/placeholder-page'

export const Route = createFileRoute('/(root)/audit')({
  component: () => (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">审计日志</h1>
      <AdminPlaceholder note="M5 里程碑：audit_logs 检索。" />
    </div>
  ),
})