import { createFileRoute, useNavigate } from '@tanstack/react-router'

import { AccountBindingFlow } from '@/features/accounts/account-binding-flow'

export const Route = createFileRoute('/(root)/accounts/new')({ component: AccountBindingPage })

function AccountBindingPage() {
  const navigate = useNavigate()
  return <AccountBindingFlow mode="page" onSuccess={() => void navigate({ to: '/accounts' })} />
}
