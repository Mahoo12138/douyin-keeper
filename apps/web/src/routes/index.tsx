import { createFileRoute, redirect } from '@tanstack/react-router'

import { LandingPage } from '@/features/landing/landing-page'
import { canActivate } from '@/lib/auth-guard'

export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    if (await canActivate()) throw redirect({ to: '/dashboard' })
  },
  component: LandingPage,
})
