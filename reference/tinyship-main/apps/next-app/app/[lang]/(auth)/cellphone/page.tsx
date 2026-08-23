'use client';

import Link from 'next/link';
import { PhoneLoginForm } from "@/components/phone-login-form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@libs/react-shared/ui/card"
import { useTranslation } from "@/hooks/use-translation"

export default function LoginPage() {
  const { t, locale } = useTranslation()

  return (
    <Card className="w-[380px]">
      <CardHeader className="text-center">
        <CardTitle className="text-xl">{t.auth.phone.title}</CardTitle>
        <CardDescription>
          {t.auth.phone.description}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <PhoneLoginForm />
        <div className="text-muted-foreground text-center text-xs text-balance [&_a]:underline [&_a]:underline-offset-4 [&_a:hover]:text-primary">
          {t.auth.phone.termsNotice} <a href="#">{t.auth.phone.termsOfService}</a>{" "}
          {t.common.and} <a href="#">{t.auth.phone.privacyPolicy}</a>.
        </div>
        <div className="flex justify-center gap-4 text-sm">
          <Link href={`/${locale}/signin`} className="text-primary hover:underline">
            {t.auth.signin.title}
          </Link>
          <span className="text-muted-foreground">|</span>
          <Link href={`/${locale}/signup`} className="text-primary hover:underline">
            {t.auth.signup.createAccount}
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}