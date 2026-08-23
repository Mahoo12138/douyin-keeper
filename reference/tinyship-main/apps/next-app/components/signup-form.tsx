'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { authClientReact } from "@libs/auth/authClient";
import { createValidators } from "@libs/validators";
import type { z } from "zod";
import { cn } from "@/lib/utils"
import { Button } from "@libs/react-shared/ui/button"
import { Input } from "@libs/react-shared/ui/input"
import { Label } from "@libs/react-shared/ui/label"
import { FormError } from "@libs/react-shared/ui/form-error"
import { Alert, AlertDescription, AlertTitle } from "@libs/react-shared/ui/alert"
import { Turnstile } from "@libs/react-shared/ui/turnstile"
import { ResendVerificationDialog } from "@/components/resend-verification-dialog"
import { Inbox } from "lucide-react"
import { useTranslation } from "@/hooks/use-translation"
import { config } from "@config"
import Link from "next/link"

export function SignupForm({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const router = useRouter();
  const { t, locale, tWithParams } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [errorCode, setErrorCode] = useState('');
  const [isVerificationEmailSent, setIsVerificationEmailSent] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState('');
  const [showResendDialog, setShowResendDialog] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileKey, setTurnstileKey] = useState(0); // 用于强制重新渲染 Turnstile

  // 创建国际化验证器
  const { signupFormSchema } = createValidators(tWithParams);
  
  type FormData = z.infer<typeof signupFormSchema>;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(signupFormSchema),
    defaultValues: {
      email: '',
      password: '',
      name: '',
      image: ''
    },
    mode: 'onBlur', // Enable validation on blur
  });

  const onSubmit = async (formData: FormData) => {
    // 如果启用了 captcha 但没有 token，则提示用户
    if (config.captcha.enabled && !turnstileToken) {
      setErrorMessage(t.auth.signup.errors.captchaRequired);
      return;
    }

    setLoading(true);
    setErrorMessage('');
    setErrorCode('');
    
    const { error, data } = await authClientReact.signUp.email(
      {
        email: formData.email,
        password: formData.password,
        name: formData.name,
        image: formData.image || undefined,
      },
      config.captcha.enabled && turnstileToken ? {
        headers: {
          "x-captcha-response": turnstileToken,
        },
      } : undefined
    );

    if (error) {
      if (error.code) {
        // Use internationalized error messages
        const authErrorMessage = t.auth.authErrors[error.code as keyof typeof t.auth.authErrors] || t.auth.authErrors.UNKNOWN_ERROR;
        setErrorMessage(authErrorMessage);
        setErrorCode(error.code);
      } else {
        setErrorMessage(t.common.unexpectedError);
        setErrorCode('UNKNOWN_ERROR');
      }
      // 如果验证失败，重置 turnstile token 并强制重新渲染
      if (config.captcha.enabled) {
        setTurnstileToken(null);
        setTurnstileKey(prev => prev + 1); // 强制重新渲染 Turnstile 组件
      }
      setLoading(false);
      return;
    }

    console.log('Sign up successful', data);
    
    // Check if email verification is required
    if (config.auth.requireEmailVerification) {
      // Show email verification prompt
      setVerificationEmail(formData.email);
      setIsVerificationEmailSent(true);
    } else {
      const params = new URLSearchParams(window.location.search);
      const returnTo = params.get('returnTo');
      router.push(returnTo || `/${locale}`);
    }
    
    setLoading(false);
  };

  if (isVerificationEmailSent && config.auth.requireEmailVerification) {
    return (
      <div className={cn("flex flex-col gap-4", className)} {...props}>
        <Alert className="my-4">
          <Inbox className="h-4 w-4" />
          <AlertTitle>{t.auth.signup.verification.title}</AlertTitle>
          <AlertDescription className="mt-2">
            <p className="mb-2">
              {t.auth.signup.verification.sent} <strong>{verificationEmail}</strong>.
            </p>
            <p className="text-sm text-muted-foreground">
              {t.auth.signup.verification.checkSpam}
              {t.auth.signup.verification.spamInstruction}
              <Button
                variant="link"
                onClick={() => setShowResendDialog(true)}
              >
                {t.actions.tryAgain}
              </Button>
            </p>
          </AlertDescription>
        </Alert>
        
        <ResendVerificationDialog
          isOpen={showResendDialog}
          onClose={() => setShowResendDialog(false)}
          email={verificationEmail}
        />
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-4", className)} {...props}>
      <FormError message={errorMessage} code={errorCode} />
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <div className="grid gap-6">
          <div className="grid gap-2">
            <Label htmlFor="name">{t.auth.signup.name}</Label>
            <div className="relative">
              <Input
                id="name"
                type="text"
                {...register('name')}
                placeholder={t.auth.signup.namePlaceholder}
                className={cn(errors.name && "border-destructive")}
                aria-invalid={errors.name ? "true" : "false"}
                autoComplete="name"
              />
              {errors.name && (
                <span className="text-destructive text-xs absolute -bottom-5 left-0">
                  {errors.name.message}
                </span>
              )}
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="email">{t.auth.signup.email}</Label>
            <div className="relative">
              <Input
                id="email"
                type="email"
                {...register('email')}
                placeholder={t.auth.signup.emailPlaceholder}
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
            <Label htmlFor="password">{t.auth.signup.password}</Label>
            <div className="relative">
              <Input
                id="password"
                type="password"
                {...register('password')}
                placeholder={t.auth.signup.passwordPlaceholder}
                className={cn(errors.password && "border-destructive")}
                aria-invalid={errors.password ? "true" : "false"}
                autoComplete="new-password"
              />
              {errors.password && (
                <span className="text-destructive text-xs absolute -bottom-5 left-0">
                  {errors.password.message}
                </span>
              )}
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="image">
              {t.auth.signup.imageUrl} ({t.auth.signup.optional})
            </Label>
            <div className="relative">
              <Input
                id="image"
                type="url"
                {...register('image')}
                placeholder={t.auth.signup.imageUrlPlaceholder}
                className={cn(errors.image && "border-destructive")}
                aria-invalid={errors.image ? "true" : "false"}
              />
              {errors.image && (
                <span className="text-destructive text-xs absolute -bottom-5 left-0">
                  {errors.image.message}
                </span>
              )}
            </div>
          </div>

          {/* Cloudflare Turnstile 验证码 */}
          <Turnstile
            key={turnstileKey}
            onSuccess={(token: string) => setTurnstileToken(token)}
            onError={() => setTurnstileToken(null)}
            onExpire={() => setTurnstileToken(null)}
          />

          <Button 
            type="submit" 
            className="w-full" 
            disabled={loading || isSubmitting || (config.captcha.enabled && !turnstileToken)}
          >
            {loading ? t.auth.signup.submitting : t.auth.signup.submit}
          </Button>
        </div>
        <div className="text-center text-sm">
          {t.auth.signup.haveAccount}{" "}
          <Link href={`/${locale}/signin`} className="text-primary hover:underline underline-offset-4">
            {t.auth.signup.signinLink}
          </Link>
        </div>
      </form>
    </div>
  );
} 