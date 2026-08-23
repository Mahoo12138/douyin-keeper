import { createFileRoute } from '@tanstack/react-router'
import { PlaceholderPage } from '@/components/placeholder-page'

export const Route = createFileRoute('/(root)/history')({
  component: () => (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">发送记录</h1>
      <PlaceholderPage note="M3 里程碑提供发送历史。当前为占位页面。" />
    </div>
  ),
})