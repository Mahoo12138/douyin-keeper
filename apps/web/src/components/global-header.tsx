import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { Menu, ShieldCheck, Sparkles, LogOut, X } from 'lucide-react'
import { useState } from 'react'
import { Avatar, AvatarFallback, Button, ThemeToggle } from '@douyin-keeper/ui-web'
import { me } from '@douyin-keeper/sdk-ts'

import { getToken, signOut as signOutSession } from '@/auth/session'

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
] as const
const navLinkClass = 'shrink-0 whitespace-nowrap rounded-md px-2.5 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground sm:px-3'

export function GlobalHeader() {
  const navigate = useNavigate()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const token = getToken()
  const identityQ = useQuery({
    queryKey: ['me', token],
    queryFn: () => me(token as string),
    enabled: !!token,
    staleTime: 60_000,
  })
  const displayName = identityQ.data?.display_name || '账号'
  const initials = displayName.slice(0, 1).toUpperCase()

  async function signOut() {
    await signOutSession()
    void navigate({ to: '/signin' })
  }

  function closeMobileNav() {
    setMobileNavOpen(false)
  }

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
                {n.label}
              </Link>
            ))}
          </div>
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
          <ThemeToggle />
          <details className="group relative hidden sm:block">
            <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-md px-2 text-sm outline-none transition-colors hover:bg-accent focus-visible:ring-1 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
              <Avatar className="size-8 border border-border">
                <AvatarFallback className="text-xs">{initials}</AvatarFallback>
              </Avatar>
              <span className="max-w-28 truncate font-medium">{displayName}</span>
            </summary>
            <div className="absolute right-0 top-full z-50 mt-2 w-56 rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg">
              <div className="px-3 py-2">
                <p className="text-sm font-medium">{displayName}</p>
                <p className="text-xs text-muted-foreground">{identityQ.data?.role === 'admin' ? '管理员' : '普通用户'}</p>
              </div>
              {identityQ.data?.role === 'admin' && <>
                <div className="my-1 h-px bg-border" />
                <Link to="/admin" className="flex min-h-10 items-center gap-2 rounded-md px-3 text-sm hover:bg-accent">
                  <ShieldCheck className="size-4" />
                  管理控制台
                </Link>
              </>}
              <div className="my-1 h-px bg-border" />
              <button type="button" className="flex min-h-10 w-full items-center gap-2 rounded-md px-3 text-left text-sm text-destructive hover:bg-destructive/10" onClick={() => void signOut()}>
                <LogOut className="size-4" />
                退出登录
              </button>
            </div>
          </details>
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label={mobileNavOpen ? '关闭导航菜单' : '打开导航菜单'}
            onClick={() => setMobileNavOpen((open) => !open)}
          >
            {mobileNavOpen ? <X /> : <Menu />}
          </Button>
        </div>
      </div>
      {mobileNavOpen && <div className="border-t bg-background md:hidden">
        <nav className="mx-auto grid max-w-6xl gap-1 px-4 py-3 sm:px-6" aria-label="主导航">
          {nav.map((n) => <Link key={n.to} to={n.to} onClick={closeMobileNav} className={`${navLinkClass} min-h-10 flex items-center`} activeProps={{ className: `${navLinkClass} min-h-10 flex items-center bg-accent text-accent-foreground font-medium` }}>{n.label}</Link>)}
          {identityQ.data?.role === 'admin' && <Link to="/admin" onClick={closeMobileNav} className="flex min-h-10 items-center gap-2 rounded-md px-3 py-1.5 text-sm text-primary hover:bg-accent"><ShieldCheck className="size-4" />管理控制台</Link>}
          <button type="button" className="flex min-h-10 items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm text-destructive hover:bg-destructive/10" onClick={() => { closeMobileNav(); void signOut() }}><LogOut className="size-4" />退出登录</button>
        </nav>
      </div>}
    </header>
  )
}
