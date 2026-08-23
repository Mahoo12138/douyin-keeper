import { createFileRoute } from '@tanstack/react-router'
import { PlaceholderPage } from '@/components/placeholder-page'

export const Route = createFileRoute('/(root)/friends')({
  component: () => (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">好友与火花</h1>
      <PlaceholderPage note="M2 里程碑提供好友同步与火花开关。当前为占位页面。" />
    </div>
  ),
})