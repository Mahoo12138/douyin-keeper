import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

/**
 * Hook to check if the current user has a valid subscription
 * @returns 订阅检查结果
 */
export function useSubscription() {
  const [hasSubscription, setHasSubscription] = useState(false);
  const [isLifetime, setIsLifetime] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    async function checkStatus() {
      try {
        const res = await fetch('/api/subscription/status');
        if (res.ok) {
          const data = await res.json();
          setHasSubscription(data.hasSubscription);
          setIsLifetime(data.isLifetime || false);
        } else {
          setHasSubscription(false);
          setIsLifetime(false);
        }
      } catch (error) {
        console.error('订阅状态检查失败', error);
        setHasSubscription(false);
        setIsLifetime(false);
      } finally {
        setIsLoading(false);
      }
    }

    checkStatus();
  }, []);

  return {
    hasSubscription,
    isLifetime,
    isLoading,
    redirectToPricing: () => {
      toast.error('需要订阅');
      router.push('/pricing');
    }
  };
}

/**
 * 受订阅保护的组件包装器
 * @param Component 要包装的组件
 * @returns 包装后的组件
 */
export function withSubscription<P extends object>(Component: React.ComponentType<P>) {
  return function SubscriptionProtected(props: P) {
    const { hasSubscription, isLoading, redirectToPricing } = useSubscription();
    
    useEffect(() => {
      if (!isLoading && !hasSubscription) {
        redirectToPricing();
      }
    }, [hasSubscription, isLoading, redirectToPricing]);
    
    if (isLoading) {
      return <div className="flex items-center justify-center p-8">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>;
    }
    
    if (!hasSubscription) {
      return null; // 重定向将在 useEffect 中进行
    }
    
    return <Component {...props} />;
  };
} 