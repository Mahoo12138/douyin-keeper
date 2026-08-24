import { createFileRoute } from '@tanstack/react-router'
import { AdminPlaceholder } from '@/features/admin/admin-placeholder'

export const Route = createFileRoute('/admin/workers')({ component: () => <Page title="Worker / 队列" note="M5 里程碑：scheduler 与三个 worker pool 的心跳与队列状态。" /> })
function Page({ title, note }: { title: string; note: string }) { return <div className="space-y-8"><div><p className="text-sm font-medium text-primary">控制台 · 运行时</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">{title}</h1></div><AdminPlaceholder note={note} /></div> }
