import { useEffect, useState } from 'react'
import { Badge } from '@libs/react-shared/ui/badge'
import { Link as LinkIcon, Mail, Key } from 'lucide-react'
import { authClientReact } from '@libs/auth/authClient'
import { useTranslation } from '@/hooks/use-translation'

export function LinkedAccountsCard() {
  const { t, locale: currentLocale } = useTranslation()
  const [accountsData, setAccountsData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchAccountsData() {
      const { data, error } = await authClientReact.listAccounts()
      if (error) {
        console.error('Failed to fetch user accounts', error)
        setAccountsData([])
      } else {
        setAccountsData(data || [])
      }
      setLoading(false)
    }
    fetchAccountsData()
  }, [])

  const formatDate = (dateString: string | Date) => {
    const date = typeof dateString === 'string' ? new Date(dateString) : dateString
    return date.toLocaleDateString(currentLocale === 'zh-CN' ? 'zh-CN' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  }

  const getProviderDisplayName = (providerId: string) => {
    const providerKey = providerId.toLowerCase() as keyof typeof t.dashboard.linkedAccounts.providers
    return t.dashboard.linkedAccounts.providers[providerKey] || providerId
  }

  const getProviderIcon = (providerId: string) => {
    switch (providerId.toLowerCase()) {
      case 'credential': return Mail
      case 'phone-number': return Key
      default: return LinkIcon
    }
  }

  if (loading) {
    return (
      <div>
        <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold"><LinkIcon className="h-5 w-5" />{t.dashboard.linkedAccounts.title}</h3>
        <div className="animate-pulse space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="bg-muted/20 flex items-center justify-between rounded-lg border p-3">
              <div className="flex items-center gap-3"><div className="bg-muted h-8 w-8 rounded-full" /><div><div className="bg-muted mb-1 h-4 w-20 rounded" /><div className="bg-muted h-3 w-32 rounded" /></div></div>
              <div className="bg-muted h-6 w-16 rounded" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold"><LinkIcon className="h-5 w-5" />{t.dashboard.linkedAccounts.title}</h3>
      <div className="space-y-3">
        {accountsData.length > 0 ? (
          accountsData.map((account) => {
            const ProviderIcon = getProviderIcon(account.providerId)
            return (
              <div key={account.id} className="bg-muted/20 flex items-center justify-between rounded-lg border p-3">
                <div className="flex items-center gap-3">
                  <div className="bg-background rounded-full border p-2"><ProviderIcon className="h-4 w-4" /></div>
                  <div>
                    <div className="font-medium">{getProviderDisplayName(account.providerId)}</div>
                    <div className="text-muted-foreground text-sm">{t.dashboard.linkedAccounts.connectedAt} {formatDate(account.createdAt)}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2"><Badge variant="secondary" className="text-xs">{t.dashboard.linkedAccounts.connected}</Badge></div>
              </div>
            )
          })
        ) : (
          <div className="text-muted-foreground py-6 text-center">
            <LinkIcon className="mx-auto mb-2 h-12 w-12 opacity-50" />
            <p>{t.dashboard.linkedAccounts.noLinkedAccounts}</p>
          </div>
        )}
      </div>
    </div>
  )
}
