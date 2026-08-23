import { createFileRoute, Outlet } from '@tanstack/react-router'
import Header from '@/components/global-header'

export const Route = createFileRoute('/$lang/(root)')({
  component: RootLayout,
})

function RootLayout() {
  return (
    <>
      <Header />
      <main>
        <Outlet />
      </main>
    </>
  )
}
