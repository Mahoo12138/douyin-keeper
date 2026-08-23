import { useState, useEffect } from "react";
import { authClientReact } from "@libs/auth/authClient";
import { useTranslation } from "@/hooks/use-translation";
import { config } from "@config";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@libs/react-shared/ui/dialog";
import { Button } from "@libs/react-shared/ui/button";
import { Input } from "@libs/react-shared/ui/input";
import { Label } from "@libs/react-shared/ui/label";
import { Turnstile } from "@libs/react-shared/ui/turnstile";
import { toast } from "sonner";

interface ResendVerificationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  email: string;
}

export function ResendVerificationDialog({
  isOpen,
  onClose,
  email,
}: ResendVerificationDialogProps) {
  const { t, locale } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileKey, setTurnstileKey] = useState(0);
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (countdown > 0) {
      timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [countdown]);

  const canSend = countdown === 0 && (!config.captcha.enabled || turnstileToken);

  const handleSubmit = async () => {
    if (!canSend) return;

    setLoading(true);

    const { data, error } = await authClientReact.sendVerificationEmail({
      email,
      callbackURL: `/${locale}`,
      fetchOptions: {
        headers: {
          "x-resend-source": "user-initiated",
          ...(config.captcha.enabled && turnstileToken
            ? { "x-captcha-response": turnstileToken }
            : {}),
        },
      },
    });

    if (error) {
      console.error("Failed to resend verification email:", error);
      toast.error(
        error.message || t.auth.signin.errors.emailNotVerified.resendError
      );
      if (config.captcha.enabled) {
        setTurnstileToken(null);
        setTurnstileKey((prev) => prev + 1);
      }
      setLoading(false);
      return;
    }

    toast.success(t.auth.signin.errors.emailNotVerified.resendSuccess);
    setCountdown(60);
    setTurnstileToken(null);
    setTurnstileKey((prev) => prev + 1);
    onClose();
    setLoading(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t.auth.signin.errors.emailNotVerified.dialogTitle}
          </DialogTitle>
          <DialogDescription>
            {t.auth.signin.errors.emailNotVerified.dialogDescription}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">
              {t.auth.signin.errors.emailNotVerified.emailLabel}
            </Label>
            <Input id="email" value={email} disabled className="bg-muted" />
          </div>

          <Turnstile
            key={turnstileKey}
            onSuccess={(token: string) => setTurnstileToken(token)}
            onError={() => setTurnstileToken(null)}
            onExpire={() => setTurnstileToken(null)}
          />

          <div className="flex items-center justify-between">
            <Button
              onClick={handleSubmit}
              disabled={!canSend || loading}
              className="flex-1"
            >
              {loading
                ? t.auth.signin.errors.emailNotVerified.sendingButton
                : countdown > 0
                  ? t.auth.signin.errors.emailNotVerified.waitButton.replace(
                      "{seconds}",
                      countdown.toString()
                    )
                  : t.auth.signin.errors.emailNotVerified.sendButton}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
