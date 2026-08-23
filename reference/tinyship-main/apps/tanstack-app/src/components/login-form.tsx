import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { authClientReact } from "@libs/auth/authClient";
import { createValidators } from "@libs/validators";
import type { z } from "zod";
import { cn } from "@libs/ui/utils/cn";
import { Button } from "@libs/react-shared/ui/button";
import { Input } from "@libs/react-shared/ui/input";
import { Label } from "@libs/react-shared/ui/label";
import { FormError } from "@libs/react-shared/ui/form-error";
import { Turnstile } from "@libs/react-shared/ui/turnstile";
import { ResendVerificationDialog } from "./resend-verification-dialog";
import { useTranslation } from "@/hooks/use-translation";
import { config } from "@config";
import { Link } from "@tanstack/react-router";

export function LoginForm({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const { t, locale, tWithParams } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [errorCode, setErrorCode] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [showResendDialog, setShowResendDialog] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileKey, setTurnstileKey] = useState(0);

  const { loginFormSchema } = createValidators(tWithParams);

  type FormData = z.infer<typeof loginFormSchema>;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { email: '', password: '', remember: true },
    mode: 'onBlur',
  });

  const onSubmit = async (data: FormData) => {
    if (config.captcha.enabled && !turnstileToken) {
      setErrorMessage(t.auth.signin.errors.captchaRequired);
      return;
    }

    setLoading(true);
    setErrorMessage('');
    setErrorCode('');
    setUserEmail(data.email);

    const params = new URLSearchParams(window.location.search);
    const returnTo = params.get('returnTo');
    const callbackURL = returnTo || `/${locale}`;

    const { error } = await authClientReact.signIn.email({
      email: data.email,
      password: data.password,
      callbackURL,
      ...(data.remember ? { rememberMe: true } : {}),
      ...(config.captcha.enabled && turnstileToken ? {
        fetchOptions: {
          headers: { "x-captcha-response": turnstileToken },
        }
      } : {})
    });

    if (error) {
      if (error.code) {
        const authErrorMessage = t.auth.authErrors[error.code as keyof typeof t.auth.authErrors] || t.auth.authErrors.UNKNOWN_ERROR;
        setErrorMessage(authErrorMessage);
        setErrorCode(error.code);
      } else {
        setErrorMessage(t.auth.signin.errors.invalidCredentials);
        setErrorCode('UNKNOWN_ERROR');
      }
      if (config.captcha.enabled) {
        setTurnstileToken(null);
        setTurnstileKey(prev => prev + 1);
      }
    }

    setLoading(false);
  };

  return (
    <div className={cn("flex flex-col gap-4", className)} {...props}>
      <FormError
        message={errorMessage}
        code={errorCode}
        userEmail={userEmail}
        onResendClick={() => setShowResendDialog(true)}
      />

      <ResendVerificationDialog
        isOpen={showResendDialog}
        onClose={() => setShowResendDialog(false)}
        email={userEmail}
      />

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <div className="grid gap-6">
          <div className="grid gap-2">
            <Label htmlFor="email">{t.auth.signin.email}</Label>
            <div className="relative">
              <Input
                id="email"
                type="email"
                {...register('email')}
                placeholder={t.auth.signin.emailPlaceholder}
                className={cn(errors.email && "border-destructive")}
                aria-invalid={errors.email ? "true" : "false"}
                autoComplete="email"
              />
              {errors.email && (
                <span className="text-destructive text-xs absolute -bottom-5 left-0">
                  {errors.email.message}
                </span>
              )}
            </div>
          </div>
          <div className="grid gap-2">
            <div className="flex items-center">
              <Label htmlFor="password">{t.auth.signin.password}</Label>
              <Link
                to="/$lang/forgot-password"
                params={{ lang: locale }}
                className="ml-auto text-sm underline-offset-4 hover:underline"
              >
                {t.auth.signin.forgotPassword}
              </Link>
            </div>
            <div className="relative">
              <Input
                id="password"
                type="password"
                {...register('password')}
                className={cn(errors.password && "border-destructive")}
                aria-invalid={errors.password ? "true" : "false"}
                autoComplete="current-password"
              />
              {errors.password && (
                <span className="text-destructive text-xs absolute -bottom-5 left-0">
                  {errors.password.message}
                </span>
              )}
            </div>
          </div>

          <Turnstile
            key={turnstileKey}
            onSuccess={(token: string) => setTurnstileToken(token)}
            onError={() => setTurnstileToken(null)}
            onExpire={() => setTurnstileToken(null)}
          />

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="remember"
              {...register('remember')}
              className="border-primary text-primary ring-offset-background focus-visible:ring-ring h-4 w-4 rounded border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            />
            <label htmlFor="remember" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
              {t.auth.signin.rememberMe}
            </label>
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={loading || isSubmitting || (config.captcha.enabled && !turnstileToken)}
          >
            {loading ? t.auth.signin.submitting : t.auth.signin.submit}
          </Button>
        </div>
        <div className="text-center text-sm">
          {t.auth.signin.noAccount}{" "}
          <Link to="/$lang/signup" params={{ lang: locale }} className="underline underline-offset-4">
            {t.auth.signin.signupLink}
          </Link>
        </div>
      </form>
    </div>
  );
}
