import { createFileRoute } from '@tanstack/react-router'
import { AdminPlaceholder } from '@/components/placeholder-page'

export const Route = createFileRoute('/(root)/workers')({
  component: () => (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Worker / 队列</h1>
      <AdminPlaceholder note="M5 里程碑：scheduler 与三个 worker pool 的心跳与队列状态。" />
    </div>
  ),
})