import { createFileRoute, Link } from '@tanstack/react-router'
import { seoHead } from '@/lib/seo'
import { PhoneLoginForm } from '@/components/phone-login-form'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@libs/react-shared/ui/card'
import { useTranslation } from '@/hooks/use-translation'

export const Route = createFileRoute('/$lang/(auth)/cellphone')({
  head: ({ params }) => seoHead(params.lang, (t) => t.auth.metadata.phone),
  component: CellphonePage,
})

function CellphonePage() {
  const { t, locale } = useTranslation()

  return (
    <Card className="w-[380px]">
      <CardHeader className="text-center">
        <CardTitle className="text-xl">{t.auth.phone.title}</CardTitle>
        <CardDescription>{t.auth.phone.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <PhoneLoginForm />
        <div className="text-muted-foreground text-balance text-center text-xs [&_a:hover]:text-primary [&_a]:underline [&_a]:underline-offset-4">
          {t.auth.phone.termsNotice}{' '}
          <a href="#">{t.auth.phone.termsOfService}</a>{' '}
          {t.common.and} <a href="#">{t.auth.phone.privacyPolicy}</a>.
        </div>
        <div className="flex justify-center gap-4 text-sm">
          <Link
            to="/$lang/signin"
            params={{ lang: locale }}
            className="text-primary hover:underline"
          >
            {t.auth.signin.title}
          </Link>
          <span className="text-muted-foreground">|</span>
          <Link
            to="/$lang/signup"
            params={{ lang: locale }}
            className="text-primary hover:underline"
          >
            {t.auth.signup.createAccount}
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}
