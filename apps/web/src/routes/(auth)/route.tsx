import { Outlet, createFileRoute } from '@tanstack/react-router'

// Centered auth layout (signin / signup).
export const Route = createFileRoute('/(auth)')({
  component: () => (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-sm">
        <Outlet />
      </div>
    </div>
  ),
})