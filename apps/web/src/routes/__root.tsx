import { Outlet, createRootRoute } from '@tanstack/react-router'
import { Toaster } from '@douyin-keeper/ui-web'
import { NotFoundPage } from '@/features/navigation/not-found-page'

export const Route = createRootRoute({
  notFoundComponent: NotFoundPage,
  component: () => (
    <>
      <Outlet />
      <Toaster />
    </>
  ),
})
