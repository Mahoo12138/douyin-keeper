import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowRight, Check, Clock3, Layers3, ShieldCheck, Sparkles, TriangleAlert, Users } from 'lucide-react'
import { Button, ThemeToggle } from '@douyin-keeper/ui-web'

const steps = [
  {
    title: '选定关系',
    description: '从真实好友列表中选择需要维护的关系，账号和好友身份始终清楚可见。',
    icon: Users,
    points: ['多账号独立登录态', '好友稳定身份映射', '不碰陌生人和群发'],
  },
  {
    title: '设定窗口',
    description: '给每天的互动留出一段明确时间，任务表达的是关系维护，不是复杂的自动化脚本。',
    icon: Clock3,
    points: ['每日最多一次', '自定义发送时间窗', '支持手动立即执行'],
  },
  {
    title: '看见结果',
    description: '成功、失败、登录失效和安全验证都会留下清晰记录，必要时任务会自动停止。',
    icon: ShieldCheck,
    points: ['发送记录可追溯', '风险状态及时提醒', '随时关闭并保留配置'],
  },
]

const principles = [
  { title: '关系优先', body: '只围绕你自己的账号和确定的好友关系工作。', icon: Users },
  { title: '动作有界', body: '每天一次、时间窗口、账号互斥，边界写进任务模型。', icon: Layers3 },
  { title: '风险可见', body: '遇到登录失效或安全验证，明确提示并停止执行。', icon: TriangleAlert },
]

export function LandingPage() {
  const [activeStep, setActiveStep] = useState(0)
  const step = steps[activeStep]
  const StepIcon = step.icon

  return (
    <div className="landing-page min-h-screen overflow-hidden bg-background text-foreground">
      <header className="relative z-20 mx-auto flex h-20 max-w-7xl items-center justify-between gap-4 px-5 sm:px-8">
        <Link to="/" className="flex shrink-0 items-center gap-2.5 font-semibold tracking-tight" aria-label="抖音火花助手首页">
          <span className="flex size-9 items-center justify-center rounded-xl bg-foreground text-background shadow-lg shadow-foreground/10"><Sparkles className="size-4" /></span>
          <span className="hidden sm:inline">抖音火花助手</span>
        </Link>
        <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex" aria-label="Landing 导航">
          <a href="#how-it-works" className="transition-colors hover:text-foreground">怎么运作</a>
          <a href="#principles" className="transition-colors hover:text-foreground">安全边界</a>
          <a href="#start" className="transition-colors hover:text-foreground">开始使用</a>
        </nav>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <ThemeToggle />
          <Button variant="ghost" asChild className="hidden sm:inline-flex"><Link to="/signin">登录</Link></Button>
          <Button asChild size="sm"><Link to="/signup">开始使用 <ArrowRight /></Link></Button>
        </div>
      </header>

      <main>
        <section className="landing-hero relative isolate flex min-h-[calc(100svh-5rem)] items-center px-5 pb-20 pt-8 sm:px-8 lg:pb-28">
          <div className="landing-orbit landing-orbit-one" aria-hidden="true" />
          <div className="landing-orbit landing-orbit-two" aria-hidden="true" />
          <div className="landing-blob landing-blob-one" aria-hidden="true" />
          <div className="landing-blob landing-blob-two" aria-hidden="true" />
          <div className="relative mx-auto grid w-full max-w-7xl items-center gap-14 lg:grid-cols-[minmax(0,0.95fr)_minmax(420px,0.9fr)] lg:gap-20">
            <div className="landing-reveal max-w-2xl">
              <h1 className="max-w-4xl text-[clamp(3.2rem,8vw,7rem)] font-semibold leading-[0.94] tracking-[-0.055em]">
                每天一次，<br /><span className="text-chart-1">把火花续上。</span>
              </h1>
              <p className="mt-8 max-w-xl text-lg leading-8 text-muted-foreground sm:text-xl">
                从真实好友列表出发，设置一个清晰的时间窗口，让关系维护变成可理解、可停止、可追溯的一件小事。
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg" className="h-12 rounded-full px-7 text-base"><Link to="/signup">创建我的任务 <ArrowRight /></Link></Button>
                <Button asChild size="lg" variant="outline" className="h-12 rounded-full px-7 text-base"><Link to="/signin">已有账号，直接登录</Link></Button>
              </div>
              <div className="mt-9 flex flex-wrap gap-x-6 gap-y-3 text-sm text-muted-foreground">
                {['多账号隔离', '风险暂停', '随时停止'].map((item) => <span key={item} className="inline-flex items-center gap-2"><Check className="size-4 text-chart-2" />{item}</span>)}
              </div>
            </div>

            <div className="landing-reveal landing-reveal-delayed relative mx-auto h-[450px] w-full max-w-[560px] sm:h-[520px]" aria-label="任务状态示意">
              <div className="landing-clay-ring landing-clay-ring-back" aria-hidden="true" />
              <div className="landing-clay-ring landing-clay-ring-middle" aria-hidden="true" />
              <div className="landing-clay-ring landing-clay-ring-front" aria-hidden="true" />
              <div className="landing-status-card absolute left-[7%] top-[12%] z-10 w-[min(88%,390px)] rounded-[1.5rem] border border-foreground/10 bg-card/90 p-5 shadow-2xl shadow-chart-1/15 backdrop-blur sm:left-[10%] sm:p-6">
                <div className="flex items-start justify-between gap-4">
                  <div><p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">今日任务</p><h2 className="mt-2 text-xl font-semibold tracking-tight">给小满续上火花</h2></div>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-chart-2/10 px-2.5 py-1 text-xs font-medium text-chart-2"><span className="size-1.5 rounded-full bg-chart-2" />已启用</span>
                </div>
                <div className="mt-7 grid grid-cols-2 gap-3 border-t pt-4 text-sm">
                  <div><p className="text-xs text-muted-foreground">执行窗口</p><p className="mt-1 font-medium">21:00 — 23:00</p></div>
                  <div><p className="text-xs text-muted-foreground">今日状态</p><p className="mt-1 font-medium text-chart-2">待执行</p></div>
                </div>
              </div>
              <div className="landing-coil-label absolute bottom-[10%] right-[2%] z-10 w-52 rounded-2xl border border-foreground/10 bg-background/90 p-4 shadow-xl backdrop-blur sm:right-[8%]">
                <div className="flex items-center gap-2 text-sm font-medium"><ShieldCheck className="size-4 text-chart-3" />遇到风险，自动停下</div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">登录失效和安全验证会进入通知，而不是悄悄重试。</p>
              </div>
              <div className="absolute bottom-[1%] left-[12%] text-[10px] font-medium uppercase tracking-[0.32em] text-muted-foreground/70">one relationship / one clear window</div>
            </div>
          </div>
        </section>

        <section id="how-it-works" className="scroll-mt-8 border-t bg-muted/30 px-5 py-24 sm:px-8 lg:py-32">
          <div className="mx-auto max-w-7xl">
            <div className="max-w-2xl">
              <h2 className="text-4xl font-semibold tracking-[-0.04em] sm:text-6xl">把复杂的自动化，<br /><span className="text-chart-3">收回到三步。</span></h2>
              <p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground">不需要脚本，不需要猜测。每一步都对应一个你能看懂的产品动作。</p>
            </div>
            <div className="mt-16 grid gap-10 lg:grid-cols-[0.78fr_1.22fr] lg:items-start">
              <div className="space-y-3">
                {steps.map((item, index) => {
                  const Icon = item.icon
                  const active = index === activeStep
                  return <button key={item.title} type="button" onClick={() => setActiveStep(index)} className={`group flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition-all ${active ? 'border-foreground bg-background shadow-xl shadow-foreground/5' : 'border-transparent hover:border-border hover:bg-background/70'}`} aria-pressed={active}>
                    <span className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${active ? 'bg-foreground text-background' : 'bg-background text-muted-foreground'}`}><Icon className="size-5" /></span>
                    <span className="min-w-0"><span className="block font-medium">{item.title}</span><span className="mt-1 block text-sm text-muted-foreground">{item.description}</span></span>
                    <ArrowRight className={`ml-auto size-4 shrink-0 transition-transform ${active ? 'translate-x-0 text-foreground' : '-translate-x-1 text-muted-foreground group-hover:translate-x-0'}`} />
                  </button>
                })}
              </div>
              <div className="relative min-h-[350px] overflow-hidden rounded-[2rem] border border-foreground/10 bg-foreground p-7 text-background shadow-2xl sm:p-10">
                <div className="absolute -right-20 -top-24 size-72 rounded-full bg-chart-1/35 blur-3xl" aria-hidden="true" />
                <div className="absolute -bottom-28 -left-16 size-72 rounded-full bg-chart-4/30 blur-3xl" aria-hidden="true" />
                <div className="relative flex h-full min-h-[295px] flex-col justify-between">
                  <div><span className="inline-flex rounded-full bg-background/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-background/70">现在查看</span><h3 className="mt-8 max-w-lg text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">{step.title}<span className="text-chart-1">.</span></h3><p className="mt-5 max-w-lg text-base leading-7 text-background/65">{step.description}</p></div>
                  <div className="mt-10 grid gap-3 sm:grid-cols-3">{step.points.map((point) => <div key={point} className="rounded-xl border border-background/15 bg-background/10 p-3 text-sm text-background/80">{point}</div>)}</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="principles" className="scroll-mt-8 px-5 py-24 sm:px-8 lg:py-32">
          <div className="mx-auto max-w-7xl">
            <div className="flex flex-col justify-between gap-6 border-b pb-10 sm:flex-row sm:items-end"><div><h2 className="text-4xl font-semibold tracking-[-0.04em] sm:text-6xl">有边界，才有长期。</h2></div><p className="max-w-md leading-7 text-muted-foreground">抖音火花助手把“不要做什么”也写进产品里，让你始终知道系统正在做什么。</p></div>
            <div className="mt-12 grid gap-4 lg:grid-cols-[1.2fr_0.8fr_0.8fr]">
              <article className="relative min-h-[300px] overflow-hidden rounded-[1.5rem] bg-chart-1 p-7 text-foreground sm:p-9"><div className="absolute -right-16 -top-16 size-56 rounded-full border-[28px] border-foreground/10" aria-hidden="true" /><div className="relative flex h-full flex-col justify-between"><Users className="size-7" /><div><h3 className="text-3xl font-semibold tracking-[-0.03em]">只维护确定的关系。</h3><p className="mt-3 max-w-sm leading-7 text-foreground/70">从你的好友列表开始，不把真实关系变成一张无边界的发送清单。</p></div></div></article>
              <article className="flex min-h-[300px] flex-col justify-between rounded-[1.5rem] border bg-card p-7 sm:p-9"><Layers3 className="size-7 text-chart-3" /><div><h3 className="text-2xl font-semibold tracking-[-0.03em]">每个账号，独立一层。</h3><p className="mt-3 leading-7 text-muted-foreground">登录态、好友数据和任务执行互相隔离，切换账号时不会混淆。</p></div></article>
              <article className="flex min-h-[300px] flex-col justify-between rounded-[1.5rem] border bg-card p-7 sm:p-9"><TriangleAlert className="size-7 text-chart-5" /><div><h3 className="text-2xl font-semibold tracking-[-0.03em]">看见风险，马上停。</h3><p className="mt-3 leading-7 text-muted-foreground">失败和安全验证不是黑盒，系统会通知你，并保留下一步判断的空间。</p></div></article>
            </div>
          </div>
        </section>

        <section className="border-y bg-muted/30 px-5 py-20 sm:px-8 lg:py-24">
          <div className="mx-auto grid max-w-7xl gap-8 md:grid-cols-4 md:gap-0 md:divide-x">
            {[
              ['01', '每天一次', '任务模型的最小承诺'],
              ['02', '账号隔离', '状态和数据各自归位'],
              ['03', '风险暂停', '停止比重试更重要'],
              ['04', '随时停止', '配置保留，动作可控'],
            ].map(([number, title, body]) => <div key={number} className="md:px-8 first:md:pl-0 last:md:pr-0"><p className="text-xs font-medium tracking-[0.22em] text-chart-3">{number}</p><p className="mt-3 text-2xl font-semibold tracking-[-0.03em]">{title}</p><p className="mt-2 text-sm text-muted-foreground">{body}</p></div>)}
          </div>
        </section>

        <section id="start" className="landing-cta relative isolate overflow-hidden px-5 py-28 sm:px-8 lg:py-36">
          <div className="landing-cta-orbit" aria-hidden="true" />
          <div className="relative mx-auto max-w-4xl text-center"><p className="text-sm font-medium uppercase tracking-[0.22em] text-background/60">你的关系，不需要一套复杂脚本</p><h2 className="mt-7 text-5xl font-semibold tracking-[-0.055em] text-background sm:text-7xl">从一个好友开始。</h2><p className="mx-auto mt-7 max-w-2xl text-lg leading-8 text-background/70">注册后绑定账号、同步好友，下一步会很清楚。</p><div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row"><Button asChild size="lg" className="h-12 rounded-full bg-background px-8 text-base text-foreground hover:bg-background/90"><Link to="/signup">开始配置火花 <ArrowRight /></Link></Button><Button asChild size="lg" variant="outline" className="h-12 rounded-full border-background/30 px-8 text-base text-background hover:bg-background/10 hover:text-background"><Link to="/signin">登录已有账号</Link></Button></div></div>
        </section>
      </main>

      <footer className="flex flex-col justify-between gap-4 bg-foreground px-5 py-8 text-sm text-background/60 sm:flex-row sm:items-center sm:px-8"><Link to="/" className="font-medium text-background">抖音火花助手</Link><p>关系维护，清晰而有边界。</p></footer>
    </div>
  )
}
