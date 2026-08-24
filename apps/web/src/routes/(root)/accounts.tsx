import { createFileRoute, Outlet, useLocation } from '@tanstack/react-router'
import { AccountsPage } from '@/features/accounts/accounts-page'

export const Route = createFileRoute('/(root)/accounts')({
	component: AccountsRoute,
})

function AccountsRoute() {
	const location = useLocation()
	return location.pathname === '/accounts' ? <AccountsPage /> : <Outlet />
}
