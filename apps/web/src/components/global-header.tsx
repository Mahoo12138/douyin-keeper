import { useQuery } from '@tanstack/react-query'
import { Link, useLocation, useNavigate } from '@tanstack/react-router'
import { HelpCircle, Menu, ShieldCheck, Sparkles, LogOut, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Avatar, AvatarFallback, Badge, Button, DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, ThemeToggle } from '@douyin-keeper/ui-web'
import { listNotifications, me, myEntitlement } from '@douyin-keeper/sdk-ts'

import { getToken, signOut as signOutSession } from '@/auth/session'
import { useMobileNavDismissed } from '@/features/navigation/mobile-nav'
import { notificationUnreadLabel } from '@/features/notifications/notification-summary-utils'

const nav = [
  { to: '/dashboard', label: '概览' },
  { to: '/accounts', label: '抖音账号' },
  { to: '/friends', label: '好友与火花' },
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
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <p className="text-sm font-medium">{displayName}</p>
                <p className="text-xs text-muted-foreground">{identityQ.data?.role === 'admin' ? '管理员' : '普通用户'}</p>
              </DropdownMenuLabel>
              <DropdownMenuItem asChild><Link to="/entitlement" className="text-primary">{entitlementLabel}</Link></DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem asChild><Link to="/help"><HelpCircle />帮助与安全边界</Link></DropdownMenuItem>
                {identityQ.data?.role === 'admin' && <DropdownMenuItem asChild><Link to="/admin"><ShieldCheck />管理控制台</Link></DropdownMenuItem>}
                <DropdownMenuItem asChild><Link to="/settings">设置</Link></DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive focus:bg-destructive/10 focus:text-destructive" onSelect={() => void signOut()}>
                <LogOut />
                退出登录
              </DropdownMenuItem>
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
