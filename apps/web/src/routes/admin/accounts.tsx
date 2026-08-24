import { createFileRoute } from '@tanstack/react-router'
import { AdminPlaceholder } from '@/features/admin/admin-placeholder'

export const Route = createFileRoute('/admin/accounts')({ component: () => <Page title="抖音账号" note="M5 里程碑：全局账号列表、运行状态与风险概览。" /> })

function Page({ title, note }: { title: string; note: string }) { return <div className="space-y-8"><div><p className="text-sm font-medium text-primary">控制台 · 资源</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">{title}</h1></div><AdminPlaceholder note={note} /></div> }
