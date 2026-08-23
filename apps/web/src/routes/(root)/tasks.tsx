import { createFileRoute } from '@tanstack/react-router'
import { PlaceholderPage } from '@/components/placeholder-page'

export const Route = createFileRoute('/(root)/tasks')({
  component: () => (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">任务</h1>
      <PlaceholderPage note="M3 里程碑提供每日火花任务配置与手动执行。当前为占位页面。" />
    </div>
  ),
})