import { createFileRoute } from '@tanstack/react-router'
import { AdminPlaceholder } from '@/features/admin/admin-placeholder'

export const Route = createFileRoute('/admin/adapters')({ component: () => <Page title="Adapter" note="M5 里程碑：adapter_health 熔断与能力状态。" /> })
function Page({ title, note }: { title: string; note: string }) { return <div className="space-y-8"><div><p className="text-sm font-medium text-primary">控制台 · 能力</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">{title}</h1></div><AdminPlaceholder note={note} /></div> }
