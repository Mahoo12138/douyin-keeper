'use client';

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { cn } from "@/lib/utils"
import { Button } from "@libs/react-shared/ui/button"
import { authClientReact } from '@libs/auth/authClient'
import { Input } from "@libs/react-shared/ui/input"
import { Label } from "@libs/react-shared/ui/label"
import { FormError } from "@libs/react-shared/ui/form-error"
import { Turnstile } from "@libs/react-shared/ui/turnstile"
import { CountrySelect } from "@libs/react-shared/ui/country-select"
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@libs/react-shared/ui/input-otp"
import { Loader2 } from "lucide-react"
import { createValidators, countryCodes } from "@libs/validators"
import type { z } from "zod"
import { useTranslation } from "@/hooks/use-translation"
import { config } from "@config"

export function PhoneLoginForm({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const router = useRouter();
  const { t, locale, tWithParams } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ code?: string; message: string } | null>(null);
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileKey, setTurnstileKey] = useState(0); // 用于强制重新渲染 Turnstile
  const [countdown, setCountdown] = useState(0); // 倒计时秒数

  // 创建国际化验证器
  const { phoneLoginSchema, phoneVerifySchema } = createValidators(tWithParams);
  
  type FormData = z.infer<typeof phoneLoginSchema>;
  type VerifyData = z.infer<typeof phoneVerifySchema>;

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(phoneLoginSchema),
    defaultValues: {
      countryCode: '+86', // 默认选择中国
      phone: '',
    },
    mode: 'onBlur', // 添加 onBlur 验证模式
  });

  const countryCode = watch("countryCode");
  const phoneNumber = watch("phone");

  // 倒计时效果
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (countdown > 0) {
      timer = setTimeout(() => {
        setCountdown(countdown - 1);
      }, 1000);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [countdown]);

  // 构建完整的手机号码用于发送短信
  const getFullPhoneNumber = (countryCode: string, phone: string): string => {
    // 统一返回完整的国际格式，让各个SMS提供商自己处理格式
    return countryCode + phone;
  };

  const onSubmitPhone = async (data: FormData) => {
    // 如果启用了 captcha 但没有 token，则提示用户
    if (config.captcha.enabled && !turnstileToken) {
      setError({
        code: "CAPTCHA_REQUIRED",
        message: t.auth.phone.errors.captchaRequired,
      });
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      const fullPhoneNumber = getFullPhoneNumber(data.countryCode, data.phone);
      console.log('Sending OTP to:', fullPhoneNumber);
      
      const { data: result, error } = await authClientReact.phoneNumber.sendOtp({
        phoneNumber: fullPhoneNumber,
        ...(config.captcha.enabled && turnstileToken ? {
          fetchOptions: {
            headers: {
              "x-captcha-response": turnstileToken,
            },
          }
        } : {})
      });
      
      if (error) {
        console.error('sendOtp error:', error);
        if (error.code) {
          // Use internationalized error messages
          const authErrorMessage = t.auth.authErrors[error.code as keyof typeof t.auth.authErrors] || t.auth.authErrors.UNKNOWN_ERROR;
          setError({
            code: error.code,
            message: authErrorMessage,
          });
        } else {
          setError({
            code: "UNKNOWN_ERROR",
            message: t.auth.authErrors.UNKNOWN_ERROR,
          });
        }
        // 如果验证失败，重置 turnstile token 并强制重新渲染
        if (config.captcha.enabled) {
          setTurnstileToken(null);
          setTurnstileKey(prev => prev + 1); // 强制重新渲染 Turnstile 组件
        }
        return;
      }
      
      console.log('OTP sent successfully');
      setOtpSent(true);
      setCountdown(30); // 启动30秒倒计时
    } catch (err: any) {
      console.error('Send OTP exception:', err);
      setError({
        code: err.code || "SMS_SEND_ERROR",
        message: err.message || t.common.unexpectedError,
      });
      // 如果验证失败，重置 turnstile token 并强制重新渲染
      if (config.captcha.enabled) {
        setTurnstileToken(null);
        setTurnstileKey(prev => prev + 1); // 强制重新渲染 Turnstile 组件
      }
    } finally {
      setLoading(false);
    }
  };

  const onVerifyOTP = async () => {
    if (otp.length !== 6) return;
    
    setLoading(true);
    setError(null);
    
    const fullPhoneNumber = getFullPhoneNumber(countryCode, phoneNumber);
    
    const { data, error } = await authClientReact.phoneNumber.verify({
      phoneNumber: fullPhoneNumber,
      code: otp
    });
    
    if (error) {
      if (error.code) {
        // Use internationalized error messages
        const authErrorMessage = t.auth.authErrors[error.code as keyof typeof t.auth.authErrors] || t.auth.authErrors.UNKNOWN_ERROR;
        setError({
          code: error.code,
          message: authErrorMessage,
        });
      } else {
        setError({
          code: "UNKNOWN_ERROR",
          message: t.auth.authErrors.UNKNOWN_ERROR,
        });
      }
      setLoading(false);
      return;
    }
    
    console.log('isVerified', data);
    if (data) {
      const params = new URLSearchParams(window.location.search);
      const returnTo = params.get('returnTo');
      router.push(returnTo || `/${locale}`);
    }
    
    setLoading(false);
  };

  // 重新发送验证码
  const onResendOTP = async () => {
    if (countdown > 0 || loading) return;
    
    setLoading(true);
    setError(null);
    
    const fullPhoneNumber = getFullPhoneNumber(countryCode, phoneNumber);
    console.log('Resending OTP to:', fullPhoneNumber);
    
    const { data: result, error } = await authClientReact.phoneNumber.sendOtp({
      phoneNumber: fullPhoneNumber,
      ...(config.captcha.enabled && turnstileToken ? {
        fetchOptions: {
          headers: {
            "x-captcha-response": turnstileToken,
          },
        }
      } : {})
    });
    
    if (error) {
      console.error('Resend OTP error:', error);
      if (error.code) {
        // Use internationalized error messages
        const authErrorMessage = t.auth.authErrors[error.code as keyof typeof t.auth.authErrors] || t.auth.authErrors.UNKNOWN_ERROR;
        setError({
          code: error.code,
          message: authErrorMessage,
        });
      } else {
        setError({
          code: "UNKNOWN_ERROR",
          message: t.auth.authErrors.UNKNOWN_ERROR,
        });
      }
      setLoading(false);
      return;
    }
    
    console.log('OTP resent successfully');
    setCountdown(30); // 重新启动30秒倒计时
    setOtp(""); // 清空之前输入的验证码
    setLoading(false);
  };

  return (
    <div className={cn("flex flex-col gap-4", className)} {...props}>
      {!otpSent ? (
        <form onSubmit={handleSubmit(onSubmitPhone)}>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="phone">{t.auth.phone.phoneNumber}</Label>
              <div className="flex gap-2">
                <Controller
                  name="countryCode"
                  control={control}
                  render={({ field }) => (
                    <CountrySelect
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={loading}
                    />
                  )}
                />
                <Input
                  id="phone"
                  placeholder={t.auth.phone.phoneNumberPlaceholder}
                  type="tel"
                  autoCapitalize="none"
                  autoComplete="tel"
                  autoCorrect="off"
                  disabled={loading}
                  className="flex-1"
                  {...register("phone")}
                />
              </div>
              {errors?.countryCode && (
                <p className="px-1 text-xs text-red-600">
                  {errors.countryCode.message}
                </p>
              )}
              {errors?.phone && (
                <p className="px-1 text-xs text-red-600">
                  {errors.phone.message}
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
              {loading ? t.auth.phone.sendingCode : t.actions.sendCode}
            </Button>
          </div>
        </form>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); onVerifyOTP(); }}>
          <div className="grid gap-6">
            <div className="text-center space-y-2">
              <h3 className="text-lg font-semibold">{t.auth.phone.enterCode}</h3>
              <p className="text-sm text-muted-foreground">
                {t.auth.phone.codeSentTo} {countryCode} {phoneNumber}
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex justify-center">
                <InputOTP
                  maxLength={6}
                  value={otp}
                  onChange={(value) => setOtp(value)}
                  disabled={loading}
                >
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>
              </div>
              
              <div className="text-center">
                {countdown > 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t.auth.phone.resendIn} {countdown} {t.auth.phone.seconds}
                  </p>
                ) : (
                  <Button
                    type="button"
                    variant="link"
                    className="text-sm"
                    onClick={onResendOTP}
                    disabled={loading}
                  >
                    {t.auth.phone.resendCode}
                  </Button>
                )}
              </div>
            </div>

            <div className="flex gap-3">
              <Button 
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setOtpSent(false);
                  setOtp("");
                  setCountdown(0);
                  setError(null);
                }}
                disabled={loading}
              >
                {t.actions.back}
              </Button>
              <Button 
                type="submit"
                className="flex-1"
                disabled={loading || otp.length !== 6}
              >
                {loading && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {loading ? t.auth.phone.verifying : t.actions.verify}
              </Button>
            </div>
          </div>
        </form>
      )}
      {error && <FormError message={error.message} code={error.code} />}
    </div>
  );
} 