import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'

import { adminActivate } from '@/lib/auth-guard'
import { AdminSidebar } from '@/components/admin-sidebar'

export const Route = createFileRoute('/(root)')({
  beforeLoad: async () => {
    if (!(await adminActivate())) {
      throw redirect({ to: '/signin' })
    }
  },
  component: () => (
    <div className="flex min-h-screen">
      <AdminSidebar />
      <main className="flex-1 overflow-auto p-6">
        <Outlet />
      </main>
    </div>
  ),
})