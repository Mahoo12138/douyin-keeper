import { createFileRoute } from '@tanstack/react-router'
import { AdminPlaceholder } from '@/features/admin/admin-placeholder'

export const Route = createFileRoute('/admin/entitlement')({ component: () => <Page title="权益与卡密" note="M5 里程碑：权益方案、卡密批次生成与兑换记录。" /> })
function Page({ title, note }: { title: string; note: string }) { return <div className="space-y-8"><div><p className="text-sm font-medium text-primary">控制台 · 权益</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">{title}</h1></div><AdminPlaceholder note={note} /></div> }
