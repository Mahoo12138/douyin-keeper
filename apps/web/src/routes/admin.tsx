import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { AdminShell } from '@/features/admin/admin-shell'
import { canActivateAdmin } from '@/lib/admin-guard'

export const Route = createFileRoute('/admin')({
  beforeLoad: async () => {
    if (!(await canActivateAdmin())) throw redirect({ to: '/signin' })
  },
  component: () => <AdminShell><Outlet /></AdminShell>,
})
