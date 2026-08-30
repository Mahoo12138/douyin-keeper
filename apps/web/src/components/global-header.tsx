import { useQuery } from '@tanstack/react-query'
import { Link, useLocation, useNavigate } from '@tanstack/react-router'
import { ChevronRight, HelpCircle, LogOut, Menu, Settings, ShieldCheck, Sparkles, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Avatar, AvatarFallback, Badge, Button, DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, ThemeToggle } from '@douyin-keeper/ui-web'
import { listNotifications, me, myEntitlement } from '@douyin-keeper/sdk-ts'

import { getToken, signOut as signOutSession } from '@/auth/session'
import { useMobileNavDismissed } from '@/features/navigation/mobile-nav'
import { notificationUnreadLabel } from '@/features/notifications/notification-summary-utils'

const nav = [
  { to: '/dashboard', label: '概览' },
  { to: '/accounts', label: '抖音账号' },
  { to: '/conversations', label: '会话' },
  { to: '/tasks', label: '任务' },
  { to: '/templates', label: '模板' },
  { to: '/history', label: '发送记录' },
  { to: '/notifications', label: '通知' },
  { to: '/entitlement', label: '权益' },
  { to: '/settings', label: '设置' },
] as const
const navLinkClass = 'shrink-0 whitespace-nowrap rounded-md px-2.5 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground sm:px-3'

export function GlobalHeader() {
  const location = useLocation()
  const navigate = useNavigate()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const token = getToken()
  const identityQ = useQuery({
    queryKey: ['me', token],
    queryFn: () => me(token as string),
    enabled: !!token,
    staleTime: 60_000,
  })
  const entitlementQ = useQuery({
    queryKey: ['entitlement'],
    queryFn: () => myEntitlement(token as string),
    enabled: !!token,
    staleTime: 60_000,
  })
  const notificationSummaryQ = useQuery({
    queryKey: ['notification-summary', token],
    queryFn: () => listNotifications(token as string, { limit: 1 }),
    enabled: !!token,
    staleTime: 60_000,
  })
  const displayName = identityQ.data?.display_name || '账号'
  const initials = displayName.slice(0, 1).toUpperCase()
  const unreadLabel = notificationUnreadLabel(notificationSummaryQ.data?.unread_count)
  const entitlementLabel = entitlementQ.data?.active
    ? `${entitlementQ.data.plan_code ?? '当前权益'} · 到期 ${formatEntitlementDate(entitlementQ.data.expires_at)}`
    : '未激活权益'

  async function signOut() {
    await signOutSession()
    void navigate({ to: '/signin' })
  }

  const closeMobileNav = useCallback(() => {
    setMobileNavOpen(false)
  }, [])
  useMobileNavDismissed(mobileNavOpen, closeMobileNav)
  useEffect(() => closeMobileNav(), [closeMobileNav, location.pathname])

  return (
    <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4 sm:gap-6 sm:px-6">
        <Link to="/dashboard" className="flex shrink-0 items-center gap-2 font-semibold">
          <Sparkles className="size-5 text-primary" />
          <span className="hidden sm:inline">抖音火花助手</span>
        </Link>
        <nav className="hidden min-w-0 flex-1 overflow-x-auto text-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:block">
          <div className="flex w-max items-center gap-1">
            {nav.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className={navLinkClass}
                activeProps={{ className: `${navLinkClass} bg-accent text-accent-foreground font-medium` }}
              >
                <NavLabel label={n.label} unreadLabel={n.to === '/notifications' ? unreadLabel : undefined} />
              </Link>
            ))}
          </div>
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
          <ThemeToggle />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="hidden min-h-10 items-center gap-2 rounded-md px-2 text-sm outline-none transition-colors hover:bg-accent focus-visible:ring-1 focus-visible:ring-ring sm:flex">
              <Avatar className="size-8 border border-border">
                <AvatarFallback className="text-xs">{initials}</AvatarFallback>
              </Avatar>
              <span className="max-w-28 truncate font-medium">{displayName}</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={10} className="w-72 overflow-hidden rounded-2xl p-0">
              <div className="border-b bg-primary/[0.06] px-4 py-4">
                <div className="flex items-start gap-3">
                  <Avatar className="size-11 border-2 border-background shadow-sm">
                    <AvatarFallback className="bg-primary text-sm font-semibold text-primary-foreground">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{displayName}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{identityQ.data?.role === 'admin' ? '管理员' : '普通用户'}</p>
                  </div>
                </div>
                <DropdownMenuItem asChild className="mt-3 min-h-0 w-full rounded-xl border border-primary/15 bg-background/80 p-0 hover:bg-background focus:bg-background"><Link to="/entitlement" className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"><span className="min-w-0"><span className="flex items-center gap-1.5 text-xs font-medium"><span className={`size-1.5 rounded-full ${entitlementQ.data?.active ? 'bg-emerald-500' : 'bg-amber-500'}`} />{entitlementQ.data?.active ? '权益有效' : '未激活权益'}</span><span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{entitlementLabel}</span></span><ChevronRight className="size-3.5 shrink-0 text-muted-foreground" /></Link></DropdownMenuItem>
              </div>
              <DropdownMenuLabel className="px-4 pb-1 pt-3 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">工作区</DropdownMenuLabel>
              <DropdownMenuGroup className="px-2 pb-2">
                <DropdownMenuItem asChild className="min-h-11 rounded-xl px-3"><Link to="/help"><span className="flex size-8 items-center justify-center rounded-lg bg-muted"><HelpCircle className="size-4" /></span><span className="flex-1"><span className="block">帮助与安全边界</span><span className="mt-0.5 block text-xs font-normal text-muted-foreground">了解哪些动作会被暂停</span></span><ChevronRight className="size-3.5 text-muted-foreground" /></Link></DropdownMenuItem>
                {identityQ.data?.role === 'admin' && <DropdownMenuItem asChild className="min-h-11 rounded-xl px-3"><Link to="/admin"><span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><ShieldCheck className="size-4" /></span><span className="flex-1"><span className="block">管理控制台</span><span className="mt-0.5 block text-xs font-normal text-muted-foreground">用户、权益与运行状态</span></span><ChevronRight className="size-3.5 text-muted-foreground" /></Link></DropdownMenuItem>}
                <DropdownMenuItem asChild className="min-h-11 rounded-xl px-3"><Link to="/settings"><span className="flex size-8 items-center justify-center rounded-lg bg-muted"><Settings className="size-4" /></span><span className="flex-1"><span className="block">设置</span><span className="mt-0.5 block text-xs font-normal text-muted-foreground">通知与登录安全</span></span><ChevronRight className="size-3.5 text-muted-foreground" /></Link></DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator className="my-0" />
              <div className="p-2">
                <DropdownMenuItem className="min-h-10 rounded-xl px-3 text-destructive focus:bg-destructive/10 focus:text-destructive" onSelect={() => void signOut()}>
                  <LogOut className="size-4" />
                  <span className="flex-1">退出登录</span>
                  <span className="text-xs text-destructive/70">当前设备</span>
                </DropdownMenuItem>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label={mobileNavOpen ? '关闭导航菜单' : '打开导航菜单'}
            aria-expanded={mobileNavOpen}
            aria-controls="global-mobile-nav"
            onClick={() => setMobileNavOpen((open) => !open)}
          >
            {mobileNavOpen ? <X /> : <Menu />}
          </Button>
        </div>
      </div>
      {mobileNavOpen && <div id="global-mobile-nav" className="border-t bg-background md:hidden">
        <nav className="mx-auto grid max-w-6xl gap-1 px-4 py-3 sm:px-6" aria-label="主导航">
          <Link to="/entitlement" onClick={closeMobileNav} className="px-3 pb-2 text-xs text-primary hover:underline">{displayName} · {entitlementLabel}</Link>
          <Link to="/help" onClick={closeMobileNav} className="flex min-h-10 items-center gap-2 rounded-md px-3 py-1.5 text-sm hover:bg-accent"><HelpCircle className="size-4" />帮助与安全边界</Link>
          {nav.map((n) => <Link key={n.to} to={n.to} onClick={closeMobileNav} className={`${navLinkClass} min-h-10 flex items-center`} activeProps={{ className: `${navLinkClass} min-h-10 flex items-center bg-accent text-accent-foreground font-medium` }}><NavLabel label={n.label} unreadLabel={n.to === '/notifications' ? unreadLabel : undefined} /></Link>)}
          {identityQ.data?.role === 'admin' && <Link to="/admin" onClick={closeMobileNav} className="flex min-h-10 items-center gap-2 rounded-md px-3 py-1.5 text-sm text-primary hover:bg-accent"><ShieldCheck className="size-4" />管理控制台</Link>}
          <button type="button" className="flex min-h-10 items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm text-destructive hover:bg-destructive/10" onClick={() => { closeMobileNav(); void signOut() }}><LogOut className="size-4" />退出登录</button>
        </nav>
      </div>}
    </header>
  )
}

function NavLabel({ label, unreadLabel }: { label: string; unreadLabel?: string }) {
  return <span className="inline-flex items-center gap-1.5">{label}{unreadLabel ? <Badge variant="warning" className="px-1.5 py-0 text-[10px]" aria-label={`${unreadLabel} 条未读通知`}>{unreadLabel}</Badge> : null}</span>
}

function formatEntitlementDate(value: string | null | undefined) {
  return value ? new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(new Date(value)) : '未设置到期时间'
}
