import { createFileRoute } from '@tanstack/react-router'
import { AdminPlaceholder } from '@/components/placeholder-page'

export const Route = createFileRoute('/(root)/adapters')({
  component: () => (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Adapter</h1>
      <AdminPlaceholder note="M5 里程碑：adapter_health 熔断与能力状态。" />
    </div>
  ),
})