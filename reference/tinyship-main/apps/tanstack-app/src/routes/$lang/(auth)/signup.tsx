import { createFileRoute } from '@tanstack/react-router'
import { seoHead } from '@/lib/seo'
import { SignupForm } from '@/components/signup-form'
import { SocialAuth } from '@/components/social-auth'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@libs/react-shared/ui/card'
import { useTranslation } from '@/hooks/use-translation'

export const Route = createFileRoute('/$lang/(auth)/signup')({
  head: ({ params }) => seoHead(params.lang, (t) => t.auth.metadata.signup),
  component: SignupPage,
})

function SignupPage() {
  const { t } = useTranslation()

  return (
    <Card className="w-[380px]">
      <CardHeader className="text-center">
        <CardTitle className="text-xl">
          {t.auth.signup.createAccount}
        </CardTitle>
        <CardDescription>{t.auth.signup.socialSignup}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <SocialAuth />
        <div className="after:border-border relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t">
          <span className="bg-card text-muted-foreground relative z-10 px-2">
            {t.auth.signup.continueWith}
          </span>
        </div>
        <SignupForm />
        <div className="text-muted-foreground *:[a]:hover:text-primary text-balance text-center text-xs *:[a]:underline *:[a]:underline-offset-4">
          {t.auth.signup.termsNotice}{' '}
          <a href="#">{t.auth.signup.termsOfService}</a>{' '}
          {t.common.and} <a href="#">{t.auth.signup.privacyPolicy}</a>.
        </div>
      </CardContent>
    </Card>
  )
}
