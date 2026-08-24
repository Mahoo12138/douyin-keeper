import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { AdminShell } from '@/features/admin/admin-shell'
import { adminRedirectTarget, resolveAdminAccess } from '@/lib/admin-guard'

export const Route = createFileRoute('/admin')({
  beforeLoad: async () => {
    const target = adminRedirectTarget(await resolveAdminAccess())
    if (target) throw redirect({ to: target })
  },
  component: () => <AdminShell><Outlet /></AdminShell>,
})
