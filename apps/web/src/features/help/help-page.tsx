import { BookOpen, ShieldCheck } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@douyin-keeper/ui-web'

import { helpSections, privacySections, type HelpSection } from './help-content'

export function HelpPage() {
  return <div className="space-y-6"><div className="max-w-2xl"><h1 className="text-3xl font-semibold tracking-tight">帮助与安全边界</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">了解账号绑定、任务配置和风险处理方式。涉及平台身份与凭据的操作始终由服务端和适配器边界保护。</p></div><div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]"><HelpCard icon={BookOpen} title="使用帮助" description="从首次绑定到日常任务维护。" sections={helpSections} /><HelpCard icon={ShieldCheck} title="隐私与安全" description="产品明确不支持的边界。" sections={privacySections} /></div><Card className="border-amber-300/70 bg-amber-500/5 dark:border-amber-700/70"><CardContent className="p-5 text-sm leading-6 text-amber-950 dark:text-amber-100">遇到登录失效、安全验证或适配器异常时，请先查看通知中心并按页面提示处理。不要分享验证码、Cookie、Session 或其他平台凭据。</CardContent></Card></div>
}

function HelpCard({ icon: Icon, title, description, sections }: { icon: typeof BookOpen; title: string; description: string; sections: HelpSection[] }) {
  return <Card><CardHeader><CardTitle className="flex items-center gap-2"><Icon className="size-5 text-primary" />{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader><CardContent><div className="divide-y rounded-lg border">{sections.map((section) => <section className="p-4" key={section.title}><h2 className="font-medium">{section.title}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{section.body}</p></section>)}</div></CardContent></Card>
}
