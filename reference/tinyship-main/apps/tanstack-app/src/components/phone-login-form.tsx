import { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { cn } from "@libs/ui/utils/cn";
import { Button } from "@libs/react-shared/ui/button";
import { authClientReact } from "@libs/auth/authClient";
import { Input } from "@libs/react-shared/ui/input";
import { Label } from "@libs/react-shared/ui/label";
import { FormError } from "@libs/react-shared/ui/form-error";
import { Turnstile } from "@libs/react-shared/ui/turnstile";
import { CountrySelect } from "@libs/react-shared/ui/country-select";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@libs/react-shared/ui/input-otp";
import { Loader2 } from "lucide-react";
import { createValidators } from "@libs/validators";
import type { z } from "zod";
import { useTranslation } from "@/hooks/use-translation";
import { config } from "@config";

export function PhoneLoginForm({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const navigate = useNavigate();
  const { t, locale, tWithParams } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{
    code?: string;
    message: string;
  } | null>(null);
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileKey, setTurnstileKey] = useState(0);
  const [countdown, setCountdown] = useState(0);

  const { phoneLoginSchema } = createValidators(tWithParams);

  type FormData = z.infer<typeof phoneLoginSchema>;

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(phoneLoginSchema),
    defaultValues: { countryCode: "+86", phone: "" },
    mode: "onBlur",
  });

  const countryCode = watch("countryCode");
  const phoneNumber = watch("phone");

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (countdown > 0) {
      timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [countdown]);

  const getFullPhoneNumber = (cc: string, phone: string): string => cc + phone;

  const onSubmitPhone = async (data: FormData) => {
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

      const { error } = await authClientReact.phoneNumber.sendOtp({
        phoneNumber: fullPhoneNumber,
        ...(config.captcha.enabled && turnstileToken
          ? {
              fetchOptions: {
                headers: { "x-captcha-response": turnstileToken },
              },
            }
          : {}),
      });

      if (error) {
        if (error.code) {
          const authErrorMessage =
            t.auth.authErrors[error.code as keyof typeof t.auth.authErrors] ||
            t.auth.authErrors.UNKNOWN_ERROR;
          setError({ code: error.code, message: authErrorMessage });
        } else {
          setError({ code: "UNKNOWN_ERROR", message: t.auth.authErrors.UNKNOWN_ERROR });
        }
        if (config.captcha.enabled) {
          setTurnstileToken(null);
          setTurnstileKey((prev) => prev + 1);
        }
        return;
      }

      setOtpSent(true);
      setCountdown(30);
    } catch (err: any) {
      setError({
        code: err.code || "SMS_SEND_ERROR",
        message: err.message || t.common.unexpectedError,
      });
      if (config.captcha.enabled) {
        setTurnstileToken(null);
        setTurnstileKey((prev) => prev + 1);
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
      code: otp,
    });

    if (error) {
      if (error.code) {
        const authErrorMessage =
          t.auth.authErrors[error.code as keyof typeof t.auth.authErrors] ||
          t.auth.authErrors.UNKNOWN_ERROR;
        setError({ code: error.code, message: authErrorMessage });
      } else {
        setError({ code: "UNKNOWN_ERROR", message: t.auth.authErrors.UNKNOWN_ERROR });
      }
      setLoading(false);
      return;
    }

    if (data) {
      const params = new URLSearchParams(window.location.search);
      const returnTo = params.get("returnTo");
      navigate({ to: returnTo || `/$lang`, params: { lang: locale } });
    }

    setLoading(false);
  };

  const onResendOTP = async () => {
    if (countdown > 0 || loading) return;

    setLoading(true);
    setError(null);

    const fullPhoneNumber = getFullPhoneNumber(countryCode, phoneNumber);

    const { error } = await authClientReact.phoneNumber.sendOtp({
      phoneNumber: fullPhoneNumber,
      ...(config.captcha.enabled && turnstileToken
        ? {
            fetchOptions: {
              headers: { "x-captcha-response": turnstileToken },
            },
          }
        : {}),
    });

    if (error) {
      if (error.code) {
        const authErrorMessage =
          t.auth.authErrors[error.code as keyof typeof t.auth.authErrors] ||
          t.auth.authErrors.UNKNOWN_ERROR;
        setError({ code: error.code, message: authErrorMessage });
      } else {
        setError({ code: "UNKNOWN_ERROR", message: t.auth.authErrors.UNKNOWN_ERROR });
      }
      setLoading(false);
      return;
    }

    setCountdown(30);
    setOtp("");
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

            <Turnstile
              key={turnstileKey}
              onSuccess={(token: string) => setTurnstileToken(token)}
              onError={() => setTurnstileToken(null)}
              onExpire={() => setTurnstileToken(null)}
            />

            <Button
              disabled={
                loading || (config.captcha.enabled && !turnstileToken)
              }
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {loading ? t.auth.phone.sendingCode : t.actions.sendCode}
            </Button>
          </div>
        </form>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onVerifyOTP();
          }}
        >
          <div className="grid gap-6">
            <div className="space-y-2 text-center">
              <h3 className="text-lg font-semibold">
                {t.auth.phone.enterCode}
              </h3>
              <p className="text-muted-foreground text-sm">
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
                  <p className="text-muted-foreground text-sm">
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
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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
