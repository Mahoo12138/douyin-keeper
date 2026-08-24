import { Link, useLocation, useNavigate } from '@tanstack/react-router'
import { CircleGauge, ClipboardList, LayoutDashboard, LogOut, Menu, ScrollText, Settings, Settings2, ShieldAlert, Smartphone, Ticket, UsersRound, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Button, ThemeToggle } from '@douyin-keeper/ui-web'
import { signOut as signOutSession } from '@/auth/session'
import { clearAdminRole } from '@/lib/admin-guard'

type AdminNavItem = { to: string; label: string; icon: typeof LayoutDashboard; exact?: boolean }

export const adminNav: AdminNavItem[] = [
  { to: '/admin', label: '运营概览', icon: LayoutDashboard, exact: true },
  { to: '/admin/users', label: '用户管理', icon: UsersRound },
  { to: '/admin/accounts', label: '抖音账号', icon: Smartphone },
  { to: '/admin/risks', label: '风险中心', icon: ShieldAlert },
  { to: '/admin/workers', label: 'Worker / 队列', icon: CircleGauge },
  { to: '/admin/jobs', label: 'Generic Jobs', icon: ClipboardList },
  { to: '/admin/adapters', label: 'Adapter', icon: Settings2 },
  { to: '/admin/settings', label: '站点设置', icon: Settings },
  { to: '/admin/entitlement', label: '权益与卡密', icon: Ticket },
  { to: '/admin/audit', label: '审计日志', icon: ScrollText },
] as const

export function AdminShell({ children }: { children: ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const active = (to: string, exact?: boolean) => exact ? location.pathname === to : location.pathname.startsWith(to)

  async function signOut() {
    clearAdminRole()
    await signOutSession()
    void navigate({ to: '/signin' })
  }

  function closeMobileNav() {
    setMobileNavOpen(false)
  }

  function renderNav() {
    return adminNav.map((item) => <Link key={item.to} to={item.to} onClick={closeMobileNav} className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${active(item.to, item.exact === true) ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground' : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'}`}><item.icon className="size-4" />{item.label}</Link>)
  }

  return (
    <div className="flex min-h-screen bg-muted/20">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex">
        <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">火</div>
          <div><div className="font-semibold">Douyin Keeper</div><div className="text-xs text-muted-foreground">Admin Console</div></div>
        </div>
        <nav className="flex-1 space-y-6 p-3">
          <div><div className="px-3 pb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">控制台</div><div className="space-y-1">{renderNav()}</div></div>
        </nav>
        <div className="border-t border-sidebar-border p-3"><Button variant="ghost" className="w-full justify-start text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" onClick={() => void signOut()}><LogOut />退出管理台</Button></div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b bg-background/90 px-4 backdrop-blur-sm md:px-8">
          <div className="flex items-center gap-3"><Button variant="ghost" size="icon" className="md:hidden" aria-label={mobileNavOpen ? '关闭管理导航' : '打开管理导航'} onClick={() => setMobileNavOpen((open) => !open)}>{mobileNavOpen ? <X /> : <Menu />}</Button><Link to="/dashboard" className="font-semibold md:hidden">Douyin Keeper</Link><span className="hidden text-sm text-muted-foreground md:inline">管理控制台</span></div>
          <div className="flex items-center gap-2"><ThemeToggle /><Button variant="ghost" size="sm" className="md:hidden" onClick={() => void signOut()}><LogOut />退出</Button><Link to="/dashboard" className="hidden text-sm text-muted-foreground hover:text-foreground md:inline">返回用户端</Link></div>
        </header>
        {mobileNavOpen && <div className="fixed inset-0 z-50 md:hidden"><button type="button" aria-label="关闭管理导航" className="absolute inset-0 bg-black/40" onClick={closeMobileNav} /><aside className="relative flex h-full w-72 max-w-[85vw] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-xl"><div className="flex h-16 items-center justify-between border-b border-sidebar-border px-5"><div className="flex items-center gap-3"><div className="flex size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">火</div><div><div className="font-semibold">Douyin Keeper</div><div className="text-xs text-muted-foreground">Admin Console</div></div></div><Button variant="ghost" size="icon" aria-label="关闭管理导航" onClick={closeMobileNav}><X /></Button></div><nav className="flex-1 space-y-6 p-3"><div><div className="px-3 pb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">控制台</div><div className="space-y-1">{renderNav()}</div></div></nav></aside></div>}
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  )
}
