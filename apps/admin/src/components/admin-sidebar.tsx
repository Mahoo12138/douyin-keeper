import { Link, useNavigate } from '@tanstack/react-router'
import { LayoutDashboard, UsersRound, Smartphone, CircleGauge, Ticket, ScrollText, LogOut } from 'lucide-react'
import { Button } from '@douyin-keeper/ui-web'

import { setToken } from '@/auth/session'

const nav = [
  { to: '/overview', label: '运营概览', icon: LayoutDashboard },
  { to: '/users', label: '用户管理', icon: UsersRound },
  { to: '/accounts', label: '抖音账号', icon: Smartphone },
  { to: '/workers', label: 'Worker / 队列', icon: CircleGauge },
  { to: '/adapters', label: 'Adapter', icon: CircleGauge },
  { to: '/entitlement', label: '权益与卡密', icon: Ticket },
  { to: '/audit', label: '审计日志', icon: ScrollText },
] as const

export function AdminSidebar() {
  const navigate = useNavigate()
  return (
    <aside className="flex w-56 flex-col border-r bg-muted/20">
      <div className="px-4 py-4 text-sm font-semibold">Douyin Keeper Admin</div>
      <nav className="flex-1 space-y-1 px-2">
        {nav.map((n) => (
          <Link
            key={n.to}
            to={n.to}
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            activeProps={{ className: 'bg-accent text-accent-foreground font-medium' }}
          >
            <n.icon className="size-4" />
            {n.label}
          </Link>
        ))}
      </nav>
      <div className="p-2">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start"
          onClick={() => {
            setToken(null)
            navigate({ to: '/signin' })
          }}
        >
          <LogOut className="size-4" />
          退出
        </Button>
      </div>
    </aside>
  )
}