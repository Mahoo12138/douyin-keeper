import { createFileRoute } from '@tanstack/react-router'
import { AdminPlaceholder } from '@/components/placeholder-page'

export const Route = createFileRoute('/(root)/entitlement')({
  component: () => (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">权益与卡密</h1>
      <AdminPlaceholder note="M5 里程碑：权益方案、卡密批次生成与兑换记录。" />
    </div>
  ),
})