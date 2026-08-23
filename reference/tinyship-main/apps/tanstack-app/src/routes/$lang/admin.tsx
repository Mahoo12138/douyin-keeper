import { createFileRoute, Outlet } from '@tanstack/react-router'
import { SidebarProvider, SidebarTrigger } from '@libs/react-shared/ui/sidebar'
import { AppSidebar } from '@/components/admin/app-sidebar'
import { requireAdmin } from '@/lib/auth-guard'

export const Route = createFileRoute('/$lang/admin')({
  beforeLoad: async ({ params }) => {
    await requireAdmin({ params: params as { lang: string } })
  },
  component: AdminLayout,
})

function AdminLayout() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <main className="flex-grow">
        <SidebarTrigger />
        <Outlet />
      </main>
    </SidebarProvider>
  )
}
