import { useState, useEffect } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { seoHead } from '@/lib/seo'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@libs/react-shared/ui/card'
import { Button } from '@libs/react-shared/ui/button'
import { Input } from '@libs/react-shared/ui/input'
import { Label } from '@libs/react-shared/ui/label'
import { FormError } from '@libs/react-shared/ui/form-error'
import { Loader2 } from 'lucide-react'
import { createValidators } from '@libs/validators'
import { authClientReact } from '@libs/auth/authClient'
import type { z } from 'zod'
import { useTranslation } from '@/hooks/use-translation'

export const Route = createFileRoute('/$lang/(auth)/reset-password')({
  head: ({ params }) => seoHead(params.lang, (t) => t.auth.metadata.resetPassword),
  component: ResetPasswordPage,
})

function ResetPasswordPage() {
  const navigate = useNavigate()
  const { t, locale, tWithParams } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<{
    code?: string
    message: string
  } | null>(null)
  const [resetSuccess, setResetSuccess] = useState(false)
  const [token, setToken] = useState<string | null>(null)

  const { resetPasswordSchema } = createValidators(tWithParams)

  type FormData = z.infer<typeof resetPasswordSchema>

  useEffect(() => {
    const urlToken = new URLSearchParams(window.location.search).get('token')
    if (!urlToken) {
      setError({
        code: 'INVALID_TOKEN',
        message: t.auth.resetPassword.errors.invalidToken,
      })
    } else {
      setToken(urlToken)
    }
  }, [t.auth.resetPassword.errors.invalidToken])

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
    mode: 'onBlur',
  })

  const onSubmit = async (data: FormData) => {
    if (!token) return

    setLoading(true)
    setError(null)

    const { error } = await authClientReact.resetPassword({
      newPassword: data.password,
      token,
    })

    if (error) {
      setError({
        code: error.code || 'UNKNOWN_ERROR',
        message: error.message || t.common.unexpectedError,
      })
      setLoading(false)
      return
    }

    setResetSuccess(true)
    setLoading(false)
  }

  return (
    <Card className="w-[380px]">
      {!resetSuccess ? (
        <>
          <CardHeader className="text-center">
            <CardTitle className="text-xl">
              {t.auth.resetPassword.title}
            </CardTitle>
            <CardDescription>
              {t.auth.resetPassword.description}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <form onSubmit={handleSubmit(onSubmit)}>
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="password">
                    {t.auth.resetPassword.password}
                  </Label>
                  <Input
                    id="password"
                    placeholder={t.auth.resetPassword.passwordPlaceholder}
                    type="password"
                    autoComplete="new-password"
                    disabled={loading}
                    {...register('password')}
                  />
                  {errors?.password && (
                    <p className="px-1 text-xs text-red-600">
                      {errors.password.message}
                    </p>
                  )}
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="confirmPassword">
                    {t.auth.resetPassword.confirmPassword}
                  </Label>
                  <Input
                    id="confirmPassword"
                    placeholder={
                      t.auth.resetPassword.confirmPasswordPlaceholder
                    }
                    type="password"
                    autoComplete="new-password"
                    disabled={loading}
                    {...register('confirmPassword')}
                  />
                  {errors?.confirmPassword && (
                    <p className="px-1 text-xs text-red-600">
                      {errors.confirmPassword.message}
                    </p>
                  )}
                </div>
                <Button disabled={loading || !token}>
                  {loading && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {loading
                    ? t.auth.resetPassword.submitting
                    : t.auth.resetPassword.submit}
                </Button>
              </div>
            </form>
            {error && (
              <FormError message={error.message} code={error.code} />
            )}
          </CardContent>
        </>
      ) : (
        <div className="space-y-4 text-center p-6">
          <h3 className="font-medium">
            {t.auth.resetPassword.success.title}
          </h3>
          <p className="text-muted-foreground">
            {t.auth.resetPassword.success.description}
          </p>
          <Button
            onClick={() =>
              navigate({
                to: '/$lang/signin',
                params: { lang: locale },
              })
            }
          >
            {t.auth.resetPassword.success.goToSignIn}
          </Button>
        </div>
      )}
    </Card>
  )
}
