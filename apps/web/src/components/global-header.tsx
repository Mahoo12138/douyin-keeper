import { Link, useNavigate } from '@tanstack/react-router'
import { Sparkles, LogOut } from 'lucide-react'
import { Button, ThemeToggle } from '@douyin-keeper/ui-web'

import { setToken } from '@/auth/session'

const nav = [
  { to: '/dashboard', label: '概览' },
  { to: '/accounts', label: '抖音账号' },
  { to: '/friends', label: '好友与火花' },
  { to: '/conversations', label: '会话' },
  { to: '/tasks', label: '任务' },
  { to: '/history', label: '发送记录' },
  { to: '/notifications', label: '通知' },
  { to: '/entitlement', label: '权益' },
] as const
const navLinkClass = 'shrink-0 whitespace-nowrap rounded-md px-2.5 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground sm:px-3'

export function GlobalHeader() {
  const navigate = useNavigate()
  return (
    <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-5xl items-center gap-2 px-4 sm:gap-6 sm:px-6">
        <Link to="/dashboard" className="flex shrink-0 items-center gap-2 font-semibold">
          <Sparkles className="size-5 text-primary" />
          <span className="hidden sm:inline">抖音火花助手</span>
        </Link>
        <nav className="min-w-0 flex-1 overflow-x-auto text-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
        <ThemeToggle />
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0 px-2 sm:px-3"
          onClick={() => {
            setToken(null)
            navigate({ to: '/signin' })
          }}
        >
          <LogOut className="size-4" />
          <span className="hidden sm:inline">退出</span>
        </Button>
      </div>
    </header>
  )
}
