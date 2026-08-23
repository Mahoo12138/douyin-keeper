'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@libs/react-shared/ui/card"
import { Button } from "@libs/react-shared/ui/button";
import { Input } from "@libs/react-shared/ui/input";
import { Label } from "@libs/react-shared/ui/label";
import { FormError } from "@libs/react-shared/ui/form-error";
import { Turnstile } from "@libs/react-shared/ui/turnstile";
import { Loader2 } from "lucide-react";
import { createValidators } from "@libs/validators";
import { authClientReact } from '@libs/auth/authClient';
import type { z } from "zod";
import { useTranslation } from "@/hooks/use-translation";
import { config } from "@config";

export default function ForgetPasswordPage() {
  const router = useRouter();
  const { t, locale, tWithParams } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ code?: string; message: string } | null>(null);
  const [emailSent, setEmailSent] = useState(false);
  const [sentEmail, setSentEmail] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileKey, setTurnstileKey] = useState(0); // 用于强制重新渲染 Turnstile

  // 创建国际化验证器
  const { forgetPasswordSchema } = createValidators(tWithParams);
  
  type FormData = z.infer<typeof forgetPasswordSchema>;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(forgetPasswordSchema),
    defaultValues: {
      email: "",
    },
    mode: 'onBlur',
  });

  const onSubmit = async (data: FormData) => {
    // 如果启用了 captcha 但没有 token，则提示用户
    if (config.captcha.enabled && !turnstileToken) {
      setError({
        code: "CAPTCHA_REQUIRED",
        message: t.auth.forgetPassword.errors.captchaRequired,
      });
      return;
    }

    setLoading(true);
    setError(null);
    
    const { data: result, error } = await authClientReact.requestPasswordReset({
      email: data.email,
      redirectTo: '/reset-password',
      fetchOptions: {
        headers: {
          'X-Locale': locale,
          ...(config.captcha.enabled && turnstileToken ? {
            "x-captcha-response": turnstileToken,
          } : {})
        }
      }
    });
    
    if (error) {
      setError({
        code: error.code || "UNKNOWN_ERROR",
        message: error.message || t.common.unexpectedError,
      });
      // 如果验证失败，重置 turnstile token 并强制重新渲染
      if (config.captcha.enabled) {
        setTurnstileToken(null);
        setTurnstileKey(prev => prev + 1); // 强制重新渲染 Turnstile 组件
      }
      setLoading(false);
      return;
    }
    
    setEmailSent(true);
    setSentEmail(data.email);
    setLoading(false);
  };

  return (
    <Card className="w-[380px]">
      {!emailSent ? (
        <>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">{t.auth.forgetPassword.title}</CardTitle>
          <CardDescription>
            {t.auth.forgetPassword.description}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          
            <form onSubmit={handleSubmit(onSubmit)}>
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="email">{t.auth.forgetPassword.email}</Label>
                  <Input
                    id="email"
                    placeholder={t.auth.forgetPassword.emailPlaceholder}
                    type="email"
                    autoCapitalize="none"
                    autoComplete="email"
                    autoCorrect="off"
                    disabled={loading}
                    {...register("email")}
                  />
                  {errors?.email && (
                    <p className="px-1 text-xs text-red-600">
                      {errors.email.message}
                    </p>
                  )}
                </div>

                {/* Cloudflare Turnstile 验证码 */}
                <Turnstile
                  key={turnstileKey}
                  onSuccess={(token: string) => setTurnstileToken(token)}
                  onError={() => setTurnstileToken(null)}
                  onExpire={() => setTurnstileToken(null)}
                />

                <Button disabled={loading || (config.captcha.enabled && !turnstileToken)}>
                  {loading && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {loading ? t.auth.forgetPassword.submitting : t.auth.forgetPassword.submit}
                </Button>
              </div>
            </form>
          {error && <FormError message={error.message} code={error.code} />}
          <div className="text-muted-foreground *:[a]:hover:text-primary text-center text-xs text-balance *:[a]:underline *:[a]:underline-offset-4">
            {t.auth.forgetPassword.termsNotice} <a href="#">{t.auth.forgetPassword.termsOfService}</a>{" "}
            {t.common.and} <a href="#">{t.auth.forgetPassword.privacyPolicy}</a>.
          </div>
        </CardContent>
        </>
      ) : (
        <div className="text-center space-y-4">
          <h3 className="font-medium">{t.auth.forgetPassword.verification.title}</h3>
          <p className="text-muted-foreground">
            {t.auth.forgetPassword.verification.sent} <span className="font-medium">{sentEmail}</span>
          </p>
          <p className="text-sm text-muted-foreground">
            {t.auth.forgetPassword.verification.checkSpam}
          </p>
        </div>
      )}
    </Card>
  )
}
