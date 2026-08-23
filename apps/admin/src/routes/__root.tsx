import { Outlet, createRootRoute } from '@tanstack/react-router'
import { Toaster } from '@douyin-keeper/ui-web'

export const Route = createRootRoute({
  component: () => (
    <>
      <Outlet />
      <Toaster />
    </>
  ),
})