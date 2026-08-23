import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { isValidLocale } from '@libs/i18n'
import { config } from '@config'
import { SharedAppProvider } from '@libs/react-shared/providers/app-context'
import { useTranslation } from '@/hooks/use-translation'

export const Route = createFileRoute('/$lang')({
  beforeLoad: ({ params }) => {
    if (!isValidLocale(params.lang)) {
      throw redirect({
        to: '/$lang',
        params: { lang: config.app.i18n.defaultLocale },
      })
    }
  },
  component: LangLayout,
})

function LangLayout() {
  const { t, locale } = useTranslation()

  return (
    <SharedAppProvider value={{ t, locale }}>
      <Outlet />
    </SharedAppProvider>
  )
}
