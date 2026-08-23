import { Button } from "./button"
import { cn } from '@libs/ui/utils/cn'
import * as React from "react"
// 以组件方式导入SVG
import GoogleIcon from "@libs/ui/icons/google.svg"
import GithubIcon from "@libs/ui/icons/github.svg"
import AppleIcon from "@libs/ui/icons/apple.svg"
import WeChatIcon from "@libs/ui/icons/wechat.svg"
import PhoneIcon from "@libs/ui/icons/phone.svg"
import { useSharedApp } from "../providers/app-context"
import { Loader2 } from "lucide-react"

export type SocialProvider = 'google' | 'github' | 'apple' | 'wechat' | 'phone';

interface SocialButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  provider: SocialProvider;
  loading?: boolean;
}

// 创建一个映射对象，将提供商名称映射到相应的图标组件
const providerIcons = {
  google: GoogleIcon,
  github: GithubIcon,
  apple: AppleIcon,
  wechat: WeChatIcon,
  phone: PhoneIcon,
} as const;

export function SocialButton({ provider, className, onClick, loading, disabled, ...props }: SocialButtonProps) {
  const { t } = useSharedApp()
  // 从映射中获取对应的图标组件
  const Icon = providerIcons[provider];
  
  const providerNames = {
    google: t.auth.signin.socialProviders.google,
    github: t.auth.signin.socialProviders.github,
    apple: t.auth.signin.socialProviders.apple,
    wechat: t.auth.signin.socialProviders.wechat,
    phone: t.auth.signin.socialProviders.phone,
  };

  return (
    <Button
      variant="outline"
      className={cn(
        "w-full bg-background hover:bg-accent hover:text-accent-foreground",
        className
      )}
      onClick={onClick}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <Icon className="mr-2 h-4 w-4" />
      )}
      {providerNames[provider]}
    </Button>
  );
}