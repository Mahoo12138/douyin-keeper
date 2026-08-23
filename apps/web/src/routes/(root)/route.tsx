import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'

import { canActivate } from '@/lib/auth-guard'
import { GlobalHeader } from '@/components/global-header'

// Protected app shell: requires an active session, then renders the header
// and the page outlet.
export const Route = createFileRoute('/(root)')({
  beforeLoad: async () => {
    if (!(await canActivate())) {
      throw redirect({ to: '/signin' })
    }
  },
  component: () => (
    <>
      <GlobalHeader />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <Outlet />
      </main>
    </>
  ),
})