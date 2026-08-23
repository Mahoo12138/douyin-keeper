import { createFileRoute, Outlet } from '@tanstack/react-router'
import { Link } from '@tanstack/react-router'
import { Logo } from '@libs/react-shared/ui/logo'
import { redirectIfAuthenticated } from '@/lib/auth-guard'

export const Route = createFileRoute('/$lang/(auth)')({
  beforeLoad: async ({ params }) => {
    await redirectIfAuthenticated({ params: params as { lang: string } })
  },
  component: AuthLayout,
})

function AuthLayout() {
  const { lang } = Route.useParams()

  return (
    <main className="bg-muted flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <Link to="/$lang" params={{ lang }} className="self-center">
          <Logo size="md" />
        </Link>
        <Outlet />
      </div>
    </main>
  )
}
