import { createFileRoute } from '@tanstack/react-router'
import { PlaceholderPage } from '@/components/placeholder-page'

export const Route = createFileRoute('/(root)/accounts')({
  component: () => (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">抖音账号</h1>
      <PlaceholderPage note="M1 里程碑提供扫码绑定、会话检查与好友同步。当前为占位页面。" />
    </div>
  ),
})