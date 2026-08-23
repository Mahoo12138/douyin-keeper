import { Link, useNavigate } from '@tanstack/react-router'
import { Sparkles, LogOut } from 'lucide-react'
import { Button } from '@douyin-keeper/ui-web'

import { setToken } from '@/auth/session'

const nav = [
  { to: '/dashboard', label: '概览' },
  { to: '/accounts', label: '抖音账号' },
  { to: '/friends', label: '好友与火花' },
  { to: '/tasks', label: '任务' },
  { to: '/history', label: '发送记录' },
  { to: '/entitlement', label: '权益' },
] as const

export function GlobalHeader() {
  const navigate = useNavigate()
  return (
    <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-6 px-4">
        <Link to="/dashboard" className="flex items-center gap-2 font-semibold">
          <Sparkles className="size-5 text-primary" />
          <span>抖音火花助手</span>
        </Link>
        <nav className="flex flex-1 items-center gap-1 text-sm">
          {nav.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className="rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              activeProps={{ className: 'bg-accent text-accent-foreground font-medium' }}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setToken(null)
            navigate({ to: '/signin' })
          }}
        >
          <LogOut className="size-4" />
          退出
        </Button>
      </div>
    </header>
  )
}