import { createFileRoute, redirect } from '@tanstack/react-router'
import { config } from '@config'

export const Route = createFileRoute('/')({
  beforeLoad: () => {
    throw redirect({
      to: '/$lang',
      params: { lang: config.app.i18n.defaultLocale },
    })
  },
})
